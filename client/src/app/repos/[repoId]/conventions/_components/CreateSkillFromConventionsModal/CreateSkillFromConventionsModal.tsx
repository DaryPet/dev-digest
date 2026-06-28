"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, FormField, TextInput, SelectInput, Textarea, Toggle, Button } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useConventionSkillPreview } from "@/lib/hooks/conventions";
import { useCreateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { s } from "../../styles";

const TYPE_VALUES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** "Create skill from conventions" modal (spec §8 / mock 3). Opens → fetches the
    server-generated skill-body preview (POST .../skill-preview) → seeds an
    editable form → POST /skills (source 'extracted') on confirm. */
export function CreateSkillFromConventionsModal({
  repoId,
  repoFullName,
  repoName,
  acceptedIds,
  onClose,
}: {
  repoId: string;
  repoFullName: string;
  repoName: string;
  acceptedIds: string[];
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const preview = useConventionSkillPreview(repoId);
  const create = useCreateSkill();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("convention");
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState("");
  const [seeded, setSeeded] = React.useState(false);

  // Fetch the generated preview once on open, then seed the editable form.
  React.useEffect(() => {
    preview.mutate(
      { candidateIds: acceptedIds },
      {
        onSuccess: (data) => {
          setName(data.name);
          setBody(data.body);
          setDescription(t("modal.defaultDescription", { count: acceptedIds.length, repo: repoName }));
          setSeeded(true);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const typeOptions = TYPE_VALUES.map((v) => ({ value: v, label: v }));

  const submit = () =>
    create.mutate(
      {
        name,
        description,
        type,
        body,
        enabled,
        source: "extracted",
        evidence_files: preview.data?.evidence_files ?? null,
      },
      {
        onSuccess: () => {
          toast.success(t("modal.createdToast", { name }));
          onClose();
        },
      },
    );

  return (
    <Modal
      title={t("modal.title")}
      subtitle={seeded ? name : undefined}
      onClose={onClose}
      width={760}
      footer={
        <div style={s.modalFooter}>
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Sparkles"
            onClick={submit}
            loading={create.isPending}
            disabled={!seeded || create.isPending || !name.trim() || !body.trim()}
          >
            {create.isPending ? t("modal.creating") : t("modal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.modalBanner}>
        {t("modal.banner", { count: acceptedIds.length, repo: repoFullName })}
      </div>

      {!seeded ? (
        <div style={s.confLabel}>{t("modal.loading")}</div>
      ) : (
        <div style={s.modalGrid}>
          <FormField label={t("modal.name")} required>
            <TextInput value={name} onChange={setName} />
          </FormField>
          <FormField label={t("modal.description")}>
            <Textarea value={description} onChange={setDescription} rows={2} />
          </FormField>
          <div style={s.modalRow}>
            <div style={s.modalCol}>
              <FormField label={t("modal.type")}>
                <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
              </FormField>
            </div>
            <div style={s.modalCol}>
              <FormField label={t("modal.enabled")}>
                <label style={s.enabledLabel}>
                  <Toggle on={enabled} onChange={setEnabled} size={16} />
                </label>
                <div style={s.enabledHint}>{t("modal.enabledHint")}</div>
              </FormField>
            </div>
          </div>
          <FormField label={t("modal.body")} required>
            <Textarea value={body} onChange={setBody} rows={14} mono />
          </FormField>
        </div>
      )}
    </Modal>
  );
}
