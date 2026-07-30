export const writeWranglerNotice = (level, message, stream = process.stderr) =>
  stream.write(`[${level}] ${message}\n`);
