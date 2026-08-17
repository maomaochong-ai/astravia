/** Platform detection for layout chrome (traffic lights, window controls). */
export const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().includes("MAC");
