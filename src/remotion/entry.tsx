/**
 * Remotion entry point — registers the root component.
 * This file is bundled by Remotion's Webpack bundler at render time.
 */
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root.js";

registerRoot(RemotionRoot);
