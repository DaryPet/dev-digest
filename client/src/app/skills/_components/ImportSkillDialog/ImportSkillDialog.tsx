/* ImportSkillDialog — file/zip import preview → editable draft → confirm.
   POST /skills/import is a PURE PREVIEW (nothing persisted); only the final
   "Save skill" call (useCreateSkill, source: 'extracted') writes anything. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Modal,
  Button,
  FormField,
  TextInput,
  Textarea,
  SelectInput,
  Markdown,
  Icon,
} from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useImportSkillPreview, useCreateSkill, type SkillImportResult } from "../../../../lib/hooks/skills";
import { useToast } from "../../../../lib/toast";
import { SkillTypeBadge } from "../../../../components/SkillTypeBadge";
import { ACCEPT, MODAL_WIDTH, SKILL_TYPE_VALUES } from "./constants";
import { readFileAsBase64 } from "./helpers";
import { s } from "./styles";

export function ImportSkillDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const preview = useImportSkillPreview();
  const create = useCreateSkill();

  const [fileName, setFileName] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<SkillImportResult | null>(null);

  // Editable draft fields, seeded from the preview's draft once it arrives.
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("custom");
  const [body, setBody] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    try {
      const content_base64 = await readFileAsBase64(file);
      preview.mutate(
        { filename: file.name, content_base64 },
        {
          onSuccess: (res) => {
            setResult(res);
            setName(res.draft.name);
            setDescription(res.draft.description);
            setType(res.draft.type);
            setBody(res.draft.body);
          },
          onError: () => toast.error(t("importDialog.parseFailed")),
        },
      );
    } catch {
      toast.error(t("importDialog.parseFailed"));
    }
  };

  const confirm = () => {
    if (!result) return;
    create.mutate(
      {
        name: name.trim() || t("page.defaultName"),
        description,
        type,
        body,
        source: "extracted",
        evidence_files: result.draft.evidence_files,
      },
      {
        onSuccess: (skill) => {
          toast.success(t("importDialog.importSuccess", { name: skill.name }));
          onClose();
          router.push(`/skills/${skill.id}`);
        },
        onError: () => toast.error(t("importDialog.importFailed")),
      },
    );
  };

  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: v }));

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("importDialog.title")}
      subtitle={t("importDialog.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("importDialog.cancel")}
          </Button>
          <Button kind="primary" icon="Check" onClick={confirm} disabled={!result || create.isPending}>
            {create.isPending ? t("importDialog.confirming") : t("importDialog.confirm")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("importDialog.fileLabel")} hint={t("importDialog.fileHint")}>
          <div style={s.fileRow}>
            <Button kind="secondary" size="sm" icon="Upload" onClick={() => fileInputRef.current?.click()}>
              {t("importDialog.choose")}
            </Button>
            <span style={s.fileName}>{fileName ?? ""}</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            onChange={onFileChange}
            style={{ display: "none" }}
            aria-label={t("importDialog.fileLabel")}
          />
        </FormField>

        {preview.isPending && <p style={s.fileName}>{t("importDialog.parsing")}</p>}

        {result && (
          <>
            {/* Trust notice — prominent, above the preview body (hard product requirement). */}
            <div role="alert" style={s.trustBanner}>
              <Icon.AlertTriangle size={18} style={s.trustIcon} />
              <div>
                <div style={s.trustTitle}>{t("importDialog.trustNoticeTitle")}</div>
                <div style={s.trustBody}>{t("importDialog.trustNotice")}</div>
              </div>
            </div>

            {result.ignored_files.length > 0 && (
              <div style={s.noticeBlock}>
                <div style={s.noticeTitle}>{t("importDialog.ignoredFilesTitle")}</div>
                <div>{result.ignored_files.join(", ")}</div>
              </div>
            )}
            {result.warnings.length > 0 && (
              <div style={s.noticeBlock}>
                <div style={s.noticeTitle}>{t("importDialog.warningsTitle")}</div>
                <div>{result.warnings.join(", ")}</div>
              </div>
            )}

            <div style={s.sectionTitle}>{t("importDialog.previewTitle")}</div>
            <FormField label={t("importDialog.name")}>
              <TextInput value={name} onChange={setName} />
            </FormField>
            <FormField label={t("importDialog.description")}>
              <TextInput value={description} onChange={setDescription} />
            </FormField>
            <FormField label={t("importDialog.type")}>
              <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
            </FormField>
            <div style={{ marginBottom: 8 }}>
              <SkillTypeBadge type={type} />
            </div>
            <FormField label={t("importDialog.body")}>
              <Textarea value={body} onChange={setBody} rows={8} mono />
            </FormField>
            <div style={s.sectionTitle}>{t("preview.bodyLabel")}</div>
            <div style={s.bodyPreview}>
              <Markdown>{body}</Markdown>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
