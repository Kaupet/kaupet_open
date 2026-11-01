import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2 } from "lucide-react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { formatErrorMessage } from "@/lib/errors";
import { invalidateSharedCategoryQueries } from "@/lib/reference-query-invalidation";
import {
  effectiveFlowForCategory,
  resolveWizardPages,
} from "@/features/listing-creation/category-flows";
import { useAllCategoryFlows } from "@/features/listing-creation/use-all-category-flows";
import { flowOwner, verticalFieldGroup } from "@/lib/verticals";
import { useCategories } from "@/hooks/use-categories";
import {
  fieldGroupLabelNb,
  LOCKED_FIELD_GROUP_KEYS,
} from "@/features/listing-creation/field-groups/registry";
import { MIDDLE_FIELD_GROUP_KEYS, type Category } from "./shared";

function SortableFieldGroupRow({
  id,
  checked,
  disabled,
  onToggle,
}: {
  id: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-2 rounded-md px-1 py-1">
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        aria-label="Dra for å endre rekkefølge"
      >
        <GripVertical className="size-4" />
      </button>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={checked} disabled={disabled} onCheckedChange={onToggle} />
        {fieldGroupLabelNb(id)}
      </label>
    </li>
  );
}

/** En feltgruppe admin ikke kan flytte eller fjerne her. */
function LockedFieldGroupRow({ label, note }: { label: string; note?: string }) {
  return (
    <li className="flex items-center gap-2 rounded-md px-1 py-1 text-sm text-muted-foreground">
      <span className="inline-block size-4 shrink-0" aria-hidden />
      <Checkbox checked disabled />
      {label}
      {note && <span className="text-xs">{note}</span>}
    </li>
  );
}

function FieldGroupPagesPreview({ label, pages }: { label: string; pages: string[][] }) {
  return (
    <p>
      <span className="font-medium text-foreground">{label}</span> — {pages.length}{" "}
      {pages.length === 1 ? "side" : "sider"}:{" "}
      {pages.map((p, i) => `${i + 1}) ${p.map((k) => fieldGroupLabelNb(k)).join(", ")}`).join("  ")}
    </p>
  );
}

export function CategoryFlowPanel({ category }: { category: Category }) {
  const qc = useQueryClient();

  const {
    data: flowRow,
    isLoading,
    isError,
    error: flowError,
  } = useQuery({
    queryKey: ["admin", "category-flow", category.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_flows")
        .select("id, category_id, field_groups, sort_order")
        .eq("category_id", category.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Uten egen rad arver kategorien nærmeste forelders flyt; editoren må vise
  // og lagre den, ikke standardflyten.
  const flowsQuery = useAllCategoryFlows();
  const categoriesQuery = useCategories();
  const loading = isLoading || flowsQuery.isLoading || categoriesQuery.isLoading;
  const loadError = isError ? flowError : (flowsQuery.error ?? categoriesQuery.error);

  const hasCustomFlow = !!flowRow;

  const [fieldGroups, setFieldGroups] = useState<string[] | null>(null);
  const effectiveFieldGroups = effectiveFlowForCategory(
    category.id,
    // Egen rad fra dialogens egen spørring vinner over en eldre delt cache.
    [
      ...(flowsQuery.data ?? []).filter((f) => f.category_id !== category.id),
      ...(flowRow ? [flowRow] : []),
    ],
    new Map((categoriesQuery.data ?? []).map((c) => [c.id, c])),
  ).fieldGroups.filter((key) => key !== "category-select");
  const storedFieldGroups = fieldGroups ?? effectiveFieldGroups;
  const middleOrder = [
    ...storedFieldGroups.filter((k) => MIDDLE_FIELD_GROUP_KEYS.includes(k)),
    ...MIDDLE_FIELD_GROUP_KEYS.filter((k) => !storedFieldGroups.includes(k)),
  ];
  // Grupper en vertikal eier flyten med (VerticalFlow) er ikke sorterbare
  // her, men må overleve et lagre når kategorien har dem — vertikalen
  // bestemmer rekkefølgen. Uten en slik eier er det standardrekken.
  const owner = flowOwner(storedFieldGroups);
  const orderFor = (middle: string[]) => {
    const active = middle.filter(
      (k) => LOCKED_FIELD_GROUP_KEYS.includes(k) || storedFieldGroups.includes(k),
    );
    return owner
      ? owner.adminOrder(storedFieldGroups, active)
      : ["photos", "title", ...active, "delivery", "location", "review-publish"];
  };
  const activeFieldGroups = orderFor(middleOrder);
  const photosIndex = activeFieldGroups.indexOf("photos");
  const lockedVerticalGroups = (before: boolean) =>
    activeFieldGroups.filter(
      (key, index) => !!verticalFieldGroup(key) && index < photosIndex === before,
    );

  const fieldGroupSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "category-flow", category.id] });
    invalidateSharedCategoryQueries(qc);
  };

  const save = useMutation({
    mutationFn: async ({ nextFieldGroups }: { nextFieldGroups: string[] }) => {
      const { error } = await supabase
        .from("category_flows")
        .upsert(
          { category_id: category.id, field_groups: nextFieldGroups },
          { onConflict: "category_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccessToast("Annonseflyt lagret");
      invalidate();
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke lagre annonseflyten")),
  });

  const resetToDefault = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("category_flows")
        .delete()
        .eq("category_id", category.id);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccessToast("Tilbakestilt til standardflyt");
      setFieldGroups(null);
      invalidate();
    },
    onError: (e: Error) =>
      showErrorToast(formatErrorMessage(e, "Kunne ikke tilbakestille annonseflyten")),
  });

  function toggleFieldGroup(key: string) {
    if (LOCKED_FIELD_GROUP_KEYS.includes(key)) return;
    const next = storedFieldGroups.includes(key)
      ? storedFieldGroups.filter((k) => k !== key)
      : [...storedFieldGroups, key];
    setFieldGroups(next);
  }

  function handleFieldGroupDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = middleOrder.indexOf(String(active.id));
    const newIndex = middleOrder.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    setFieldGroups(orderFor(arrayMove(middleOrder, oldIndex, newIndex)));
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Velg og sorter hvilke feltgrupper og moduler som vises i annonseskjemaet for denne
        kategorien og dens underkategorier. Uten egen flyt her arves nærmeste overordnede kategoris
        flyt, eller standardflyten hvis ingen har en.
      </p>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : loadError ? (
        <p className="py-2 text-sm text-destructive">
          {formatErrorMessage(loadError, "Kunne ikke laste annonseflyten")}
        </p>
      ) : (
        <div className="space-y-4">
          {!hasCustomFlow && (
            <p className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
              Denne kategorien har ingen egen flyt ennå — viser flyten den arver fra nærmeste
              overordnede kategori (eller standardflyten). Lagre gir kategorien en egen kopi.
            </p>
          )}

          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Feltgrupper</p>
            {owner && (
              <p className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                {owner.adminInfoNb}
              </p>
            )}
            <ul>
              {lockedVerticalGroups(true).map((key) => (
                <LockedFieldGroupRow
                  key={key}
                  label={fieldGroupLabelNb(key)}
                  note={verticalFieldGroup(key)?.adminNoteNb}
                />
              ))}
              <LockedFieldGroupRow
                label={
                  activeFieldGroups.includes("title")
                    ? `${fieldGroupLabelNb("photos")} & ${fieldGroupLabelNb("title").toLowerCase()}`
                    : fieldGroupLabelNb("photos")
                }
                note="(alltid først)"
              />
              {lockedVerticalGroups(false).map((key) => (
                <LockedFieldGroupRow
                  key={key}
                  label={fieldGroupLabelNb(key)}
                  note={verticalFieldGroup(key)?.adminNoteNb}
                />
              ))}
            </ul>
            <DndContext
              sensors={fieldGroupSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleFieldGroupDragEnd}
            >
              <SortableContext items={middleOrder} strategy={verticalListSortingStrategy}>
                <ul>
                  {middleOrder.map((key) => (
                    <SortableFieldGroupRow
                      key={key}
                      id={key}
                      checked={
                        LOCKED_FIELD_GROUP_KEYS.includes(key) || storedFieldGroups.includes(key)
                      }
                      disabled={LOCKED_FIELD_GROUP_KEYS.includes(key)}
                      onToggle={() => toggleFieldGroup(key)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
            <ul>
              <li className="flex items-center gap-2 rounded-md px-1 py-1 text-sm text-muted-foreground">
                <span className="inline-block size-4 shrink-0" aria-hidden />
                <Checkbox checked disabled />
                {fieldGroupLabelNb("delivery")}
                <span className="text-xs">(påkrevd for relevante kategorier)</span>
              </li>
              <li className="flex items-center gap-2 rounded-md px-1 py-1 text-sm text-muted-foreground">
                <span className="inline-block size-4 shrink-0" aria-hidden />
                <Checkbox checked disabled />
                {fieldGroupLabelNb("review-publish")}
                <span className="text-xs">(alltid sist)</span>
              </li>
            </ul>
          </div>

          <div className="space-y-1 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Forhåndsvisning av annonseskjemaet</p>
            <FieldGroupPagesPreview
              label="Web"
              pages={resolveWizardPages(activeFieldGroups, { native: false })}
            />
            <FieldGroupPagesPreview
              label="Native"
              pages={resolveWizardPages(activeFieldGroups, { native: true })}
            />
          </div>
        </div>
      )}

      <DialogFooter className="gap-2 sm:justify-between">
        {hasCustomFlow && (
          <Button
            type="button"
            variant="outline"
            onClick={() => resetToDefault.mutate()}
            disabled={resetToDefault.isPending}
          >
            {resetToDefault.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Tilbakestill til standard"
            )}
          </Button>
        )}
        <Button
          type="button"
          // Lagre etter en hentefeil ville overskrevet flyten med en fallback.
          disabled={save.isPending || loading || !!loadError}
          onClick={() => save.mutate({ nextFieldGroups: activeFieldGroups })}
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : "Lagre"}
        </Button>
      </DialogFooter>
    </>
  );
}
