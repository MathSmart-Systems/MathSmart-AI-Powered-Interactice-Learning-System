"use server";

import { revalidatePath } from "next/cache";

import {
  archiveModule,
  createModule,
  listCompetencies,
  restoreModule,
  updateModule,
} from "./learning-modules-api";
import {
  modulePayload,
  readModuleForm,
  validateModule,
} from "../utils/module-form";

const LEARNING_MODULES_PATH = "/teacher/learning-modules";

function failure(formError, fieldErrors = {}) {
  return { success: false, formError, fieldErrors };
}

/**
 * True when the module's chosen competency is not currently published, so the
 * module would be invisible to learners the moment it is published too. The
 * database only shows a learner a module once its competency is published; the
 * form has to refuse the same way. A degraded competency read cannot confirm a
 * hidden state, so it is treated as publishable rather than guessed at.
 */
async function competencyHidesModule(competencyId) {
  const result = await listCompetencies();

  if (!result.ok) {
    return false;
  }

  const competency = (Array.isArray(result.items) ? result.items : []).find(
    (item) => String(item?.competency_id) === String(competencyId),
  );

  return Boolean(competency && competency.status !== "published");
}

/**
 * Authors a module (draft or published) and refreshes the list so the new row
 * appears on the page. Validation mirrors the API contract; anything the
 * service refuses reaches the form as a field or form-level message.
 */
export async function createModuleAction(_previousState, formData) {
  const values = readModuleForm(formData);
  const fieldErrors = validateModule(values);

  if (Object.keys(fieldErrors).length > 0) {
    return failure("Check the highlighted fields before saving.", fieldErrors);
  }

  if (values.status === "published" && (await competencyHidesModule(values.competency_id))) {
    return failure("Publish the competency before publishing the module.", {
      competency_id:
        "Learners can only open this module once its competency is published.",
    });
  }

  const result = await createModule(modulePayload(values));

  if (!result.ok) {
    return failure(result.message ?? "The module could not be saved.", result.fields ?? {});
  }

  revalidatePath(LEARNING_MODULES_PATH);
  return { success: true, formError: null, fieldErrors: {} };
}

/**
 * Updates an existing module. Every module field is readable, so the dialog
 * opens with what is stored and the update rewrites the module with the values
 * on this form — nothing is silently preserved, and nothing is lost.
 */
export async function updateModuleAction(_previousState, formData) {
  const values = readModuleForm(formData);

  if (!values.id) {
    return failure("This module could not be found. Refresh the page and try again.");
  }

  const fieldErrors = validateModule(values);

  if (Object.keys(fieldErrors).length > 0) {
    return failure("Check the highlighted fields before saving.", fieldErrors);
  }

  if (values.status === "published" && (await competencyHidesModule(values.competency_id))) {
    return failure("Publish the competency before publishing the module.", {
      competency_id:
        "Learners can only open this module once its competency is published.",
    });
  }

  const result = await updateModule(values.id, modulePayload(values));

  if (!result.ok) {
    return failure(result.message ?? "The module could not be updated.", result.fields ?? {});
  }

  revalidatePath(LEARNING_MODULES_PATH);
  return { success: true, formError: null, fieldErrors: {} };
}

/** Archives a module. Learner records keep pointing at the row. */
export async function archiveModuleAction(_previousState, formData) {
  const id = String(formData.get("id") ?? "").trim();

  if (!id) {
    return failure("This module could not be found. Refresh the page and try again.");
  }

  const result = await archiveModule(id);

  if (!result.ok) {
    return failure(result.message ?? "The module could not be archived.", result.fields ?? {});
  }

  revalidatePath(LEARNING_MODULES_PATH);
  return { success: true, formError: null, fieldErrors: {} };
}

/**
 * Returns an archived module to draft so it can be reused.
 *
 * The row's restore control runs this through `useActionState`, so a failure
 * reaches the row as a `formError` instead of vanishing silently.
 */
export async function restoreModuleAction(_previousState, formData) {
  const id = String(formData.get("id") ?? "").trim();

  if (!id) {
    return failure("This module could not be found. Refresh the page and try again.");
  }

  const result = await restoreModule(id);

  if (!result.ok) {
    return failure(result.message ?? "The module could not be restored.", result.fields ?? {});
  }

  revalidatePath(LEARNING_MODULES_PATH);
  return { success: true, formError: null, fieldErrors: {} };
}