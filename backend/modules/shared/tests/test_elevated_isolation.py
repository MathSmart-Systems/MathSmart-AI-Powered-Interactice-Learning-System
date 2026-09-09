"""The elevated reach must stay where it is.

The secret key and the RLS-bypassing database path are powerful enough that
their blast radius should be visible in the import graph rather than trusted to
review. This test fails the moment a new module reaches for either.
"""

import ast
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[3]

ELEVATED_MODULES = ("modules.shared.elevated_db", "modules.shared.auth_admin")

SESSION_GATEWAY = "modules.shared.session_gateway"

#: The gateway reads auth.sessions outside Row Level Security. It answers one
#: boolean and nothing else, and only these files may reach it.
SESSION_GATEWAY_ALLOWED = {
    # Owns it, and hands it to nobody.
    "app/main.py",
    # The one dependency that asks the question.
    "app/dependencies.py",
    # The module itself.
    "modules/shared/session_gateway.py",
}

#: Where elevated access is sanctioned, and why.
ALLOWED = {
    # Owns the objects, because something must, and hands them to nobody.
    "app/main.py",
    # The one sanctioned elevated operation: administrator-provisioned accounts.
    "modules/students/provisioning.py",
    # The administrative bootstrap, which is a local command and is never
    # mounted on the API. It attaches a profile to an Auth account that already
    # exists, for the first educator, who has nobody to provision them.
    "cli/bootstrap_profile.py",
    # The modules themselves, and their own tests.
    "modules/shared/elevated_db.py",
    "modules/shared/auth_admin.py",
}


def module_package(path: Path) -> str:
    """The dotted package containing `path`, as an import inside it would spell it."""
    return ".".join(path.resolve().relative_to(BACKEND).parts[:-1])


def _absolute_base(node: ast.ImportFrom, package: str) -> str:
    """The dotted module an `import from` reads out of, relative imports resolved.

    `from .x import y` inside `modules.shared` is `modules.shared.x`; each extra
    dot climbs one package. An import that climbs past the backend root cannot
    name anything here, and is reported as nothing rather than guessed at.
    """
    if not node.level:
        return node.module or ""
    parts = package.split(".") if package else []
    ascended = node.level - 1
    if ascended > len(parts):
        return ""
    anchor = parts[: len(parts) - ascended] if ascended else parts
    return ".".join([*anchor, node.module] if node.module else anchor)


def parse_imports(source: str, *, package: str) -> set[str]:
    """Every module `source` reaches, by the dotted path this file checks against.

    `from modules.shared import elevated_db` binds the module just as surely as
    `import modules.shared.elevated_db` does, so the name each alias binds is
    joined to its base. Read from the syntax tree, never from the text: a guard
    that greps its own source is a guard that a comment can trip and a line
    break can fool.
    """
    tree = ast.parse(source)
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            base = _absolute_base(node, package)
            if not base:
                continue
            found.add(base)
            found.update(f"{base}.{alias.name}" for alias in node.names if alias.name != "*")
    return found


def imported_modules(path: Path) -> set[str]:
    return parse_imports(path.read_text(encoding="utf-8"), package=module_package(path))


def source_files() -> list[Path]:
    return [
        path
        for path in BACKEND.rglob("*.py")
        if "tests" not in path.parts and ".venv" not in path.parts
    ]


def test_only_sanctioned_modules_reach_elevated_access():
    offenders = []
    for path in source_files():
        relative = path.relative_to(BACKEND).as_posix()
        if relative in ALLOWED:
            continue
        imports = imported_modules(path)
        if any(module in imports for module in ELEVATED_MODULES):
            offenders.append(relative)

    assert offenders == [], (
        "These modules reach elevated access without being on the allowlist: "
        f"{offenders}. Elevated access is for account provisioning and recovery only."
    )


def test_the_shared_dependencies_import_nothing_elevated():
    """Checked against the imports, not the prose: the docstring discusses them."""
    imports = imported_modules(BACKEND / "app" / "dependencies.py")

    assert not any(module in imports for module in ELEVATED_MODULES)


def test_the_shared_dependencies_offer_no_elevated_accessor():
    tree = ast.parse((BACKEND / "app" / "dependencies.py").read_text(encoding="utf-8"))
    names = [
        node.name
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)
    ]

    # "teacher_admin" is a MathSmart role, not elevation, so only the elevated
    # names are of interest here.
    assert not [name for name in names if "elevated" in name or "auth_admin" in name]


def test_the_allowlist_is_short_on_purpose():
    assert len(ALLOWED) == 5


def test_only_the_sensitive_dependency_reaches_the_session_gateway():
    """`auth.sessions` is not a table feature code gets to read."""
    offenders = []
    for path in source_files():
        relative = path.relative_to(BACKEND).as_posix()
        if relative in SESSION_GATEWAY_ALLOWED:
            continue
        if SESSION_GATEWAY in imported_modules(path):
            offenders.append(relative)

    assert offenders == [], (
        "These modules reach the session gateway without being on the allowlist: "
        f"{offenders}. Session validation belongs behind the sensitive dependency."
    )


def test_a_from_package_import_module_is_reported_as_a_dotted_path():
    """`from modules.shared import elevated_db` is an ordinary way to spell it."""
    imports = parse_imports(
        "from modules.shared import elevated_db, db\n", package="modules.students"
    )

    assert "modules.shared.elevated_db" in imports
    assert "modules.shared.db" in imports


def test_a_relative_import_resolves_against_the_package_of_the_file():
    imports = parse_imports(
        "from .elevated_db import ElevatedDatabase\n"
        "from . import auth_admin\n"
        "from ..students import provisioning\n",
        package="modules.shared",
    )

    assert "modules.shared.elevated_db" in imports
    assert "modules.shared.auth_admin" in imports
    assert "modules.students.provisioning" in imports


def test_a_plain_import_still_reports_its_dotted_path():
    imports = parse_imports("import modules.shared.elevated_db as elevated\n", package="cli")

    assert "modules.shared.elevated_db" in imports


def test_the_package_of_a_file_is_its_directory_under_the_backend():
    assert module_package(BACKEND / "modules" / "shared" / "elevated_db.py") == "modules.shared"
    assert module_package(BACKEND / "cli" / "bootstrap_profile.py") == "cli"
