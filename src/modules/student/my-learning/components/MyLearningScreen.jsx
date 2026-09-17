import { MY_LEARNING_STATE, readMyLearning } from "../services/my-learning-data";

import { MyLearningNoProfile, MyLearningServiceError } from "./MyLearningUnavailable";
import { MyLearningView } from "./MyLearningView";

/**
 * Reads the signed-in learner's lessons and renders whichever of the three
 * outcomes applies. The route wraps this in a `<Suspense>` boundary, so the
 * workspace shell and the loading shape are on screen while this awaits.
 */
export async function MyLearningScreen() {
  const result = await readMyLearning();

  if (result.state === MY_LEARNING_STATE.NO_PROFILE) {
    return <MyLearningNoProfile />;
  }

  if (result.state === MY_LEARNING_STATE.ERROR) {
    return <MyLearningServiceError />;
  }

  return (
    <MyLearningView
      model={result.model}
      diagnosticStatus={result.diagnosticStatus}
      pathUnavailable={result.pathUnavailable}
    />
  );
}