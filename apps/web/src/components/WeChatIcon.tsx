// Keep this tiny brand mark in the application bundle. Loading it from
// /icons made the toolbar briefly show the browser's broken-image glyph when
// a deployment switched the JavaScript and public assets at different times.
const WECHAT_ICON_SRC =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEwAAABMCAYAAADHl1ErAAACs0lEQVR4nO2c7W3DIBCGAWUnOhAjJFMkIzBQmcqVk1SqKn/AfUN4f1SVqjrw+L2Dw+c4NzXFKe8Ula737/evsfJfSn7cvtynAUsvULWQNpUfN5Wxi35out4X6mtKg/O9OMoKON+jqzSh+Z5dpQEujAaL29UswJwirI0ti21gSTBnnShyQAuDwmJzehgYFsu4fIfAyvpjr0TaW3CoVk7fAayCqR9/AX4CsKJdaG/pgr1AIl6JtIpqyaQfHZ2jTMMicRiFWkGdnKOxhrLXzl+5AhbgoJENoFesGUvtRKgWFYqQ1wJWoHedAh4GHFfxzRYi62SxTsFAFweWifKJFjRRYJl42/C+3rNUkoImBiwz7bFWx2Ku3QotCIVXccySghYkSqAsVBMioX2TAXvfgQgZiHS5g/i8SAKswq7F2VPhchk66WeDRzCIMUVSYKkxj2mePkA/+2yOoTEcY0dhCR1XZN+H5e0QUIfIkS6agaX9RaAYzW2FMiwD1Q442wFEMa5IGpJp5w70cMSMFTSHxb0/GIVGlk/BST8dhKw1aJTpIozYHsCpYLWtyKosPZfsIo+RbFzTB4Xm8O1O1ImfvKEuDZ7TAkPMR+tuq1ARfwiSlKCtDse6/Ch8Q2+1IddRelfdO1j9b1ngvNmXilg2u89KDb0dtWF6VtYdAlvvFFcuSn8m0NDFg2l7itZDstS6wsqqWnNoULNKgrYXecM1EkmZ+6TkFBhFAk2vpd6Ei7Cgg1DfQnQC2hsn5cPolhxWWiZu3VHQKGrtXl6cUUHd1Ro9TaVRNnb0TLAwNc8H+jh9cZ27C3rzQcV3NuQ0yFhUuqizAWhHY9hxF/r1HPU3QTha1zfGRPY2SNDuZAaoZfJPR5l5dUbYcSben+T8oo9lJFDWv3unWII0NTU1NTU1NTU1NeUG1w+D9HB3AycvtgAAAABJRU5ErkJggg==";

export const WeChatIcon = ({ className }: { className?: string }) => (
  <img
    src={WECHAT_ICON_SRC}
    alt=""
    aria-hidden="true"
    className={className}
  />
);
