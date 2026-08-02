import type { ReactNode } from "react";
import { LazyMotion, MotionConfig } from "motion/react";

const loadMotionFeatures = () => import("@/lib/motion-features").then((module) => module.default);

export const WorkspaceMotionProvider = ({ children }: { children: ReactNode }) => (
  <LazyMotion features={loadMotionFeatures} strict>
    <MotionConfig reducedMotion="user">{children}</MotionConfig>
  </LazyMotion>
);
