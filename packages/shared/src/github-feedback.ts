const GITHUB_NEW_ISSUE_URL = "https://github.com/tianma-if/edgeever/issues/new";

export type GitHubFeedbackSystemInfoItem = {
  label: string;
  value: string;
};

export const buildGitHubFeedbackUrl = ({
  contentHeading,
  contentPrompt,
  privacyNotice,
  systemInfo,
  systemInfoHeading,
  systemInfoNotice,
  titlePrefix,
}: {
  contentHeading: string;
  contentPrompt: string;
  privacyNotice: string;
  systemInfo: GitHubFeedbackSystemInfoItem[];
  systemInfoHeading: string;
  systemInfoNotice: string;
  titlePrefix: string;
}) => {
  const body = [
    `## ${contentHeading}`,
    "",
    `<!-- ${contentPrompt} -->`,
    "",
    `## ${systemInfoHeading}`,
    "",
    `<!-- ${systemInfoNotice} -->`,
    ...systemInfo.map((item) => `- ${item.label}: ${item.value}`),
    "",
    `> ${privacyNotice}`,
  ].join("\n");
  return `${GITHUB_NEW_ISSUE_URL}?title=${encodeURIComponent(titlePrefix)}&body=${encodeURIComponent(body)}`;
};
