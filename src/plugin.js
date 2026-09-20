// OpenCode loads this entry through the installed plugin loader.
import { createAzurePrReviewPlugin } from './runtime.mjs';

export const AzurePrReview = async (context) => createAzurePrReviewPlugin(context);
