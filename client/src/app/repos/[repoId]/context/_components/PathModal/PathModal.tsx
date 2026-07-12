"use client";

import React from "react";
import { Modal, FormField, TextInput, Button } from "@devdigest/ui";
import { s } from "../../styles";

/** Path-entry modal shared by the toolbar's new-file / new-folder / upload
    actions. The caller owns the mutation; this collects a repo-relative path
    and surfaces the server's validation error inline. */
export function PathModal({
  title,
  subtitle,
  pathLabel,
  placeholder,
  confirmLabel,
  cancelLabel,
  initialPath,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  subtitle: string;
  pathLabel: string;
  placeholder: string;
  confirmLabel: string;
  cancelLabel: string;
  initialPath?: string;
  pending?: boolean;
  error?: string | null;
  onConfirm: (path: string) => void;
  onClose: () => void;
}) {
  const [path, setPath] = React.useState(initialPath ?? "");

  return (
    <Modal
      width={480}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <>
          <Button kind="secondary" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button kind="primary" loading={pending} disabled={!path.trim()} onClick={() => onConfirm(path.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <FormField label={pathLabel} required>
        <TextInput
          mono
          value={path}
          onChange={setPath}
          placeholder={placeholder}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && path.trim()) onConfirm(path.trim());
          }}
        />
      </FormField>
      {error && <div style={s.modalError}>{error}</div>}
    </Modal>
  );
}
