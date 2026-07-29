export const userDataDirectoryFromArguments = (argumentsList) => {
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--user-data-dir") {
      return argumentsList[index + 1]?.trim() || "";
    }
    if (argument.startsWith("--user-data-dir=")) {
      return argument.slice("--user-data-dir=".length).trim();
    }
  }
  return "";
};
