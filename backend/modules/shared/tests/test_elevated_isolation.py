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
    # The modules themselves, and their own tests.
    "modules/shared/elevated_db.py",
    "modules/shared/auth_admin.py",
}


def imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            found.add(node.module)
    return found


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
    assert len(ALLOWED) == 4


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
