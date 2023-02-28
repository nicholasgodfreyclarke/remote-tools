import * as vscode from "vscode";

export function getSelectedText(): string | undefined {
  const editor = vscode.window.activeTextEditor!;
  const selection = editor.selection;
  if (selection && !selection.isEmpty) {
    const selectionRange = new vscode.Range(
      selection.start.line,
      selection.start.character,
      selection.end.line,
      selection.end.character
    );
    return editor.document.getText(selectionRange);
  } else {
    return undefined;
  }
}
