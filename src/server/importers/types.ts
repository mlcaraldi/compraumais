export type RowWarning = {
  code: string;
  message: string;
  /** blocking = impede confirmar a importação até ser resolvido */
  severity: "warning" | "blocking";
};

export const warn = (code: string, message: string): RowWarning => ({
  code,
  message,
  severity: "warning",
});
export const block = (code: string, message: string): RowWarning => ({
  code,
  message,
  severity: "blocking",
});
