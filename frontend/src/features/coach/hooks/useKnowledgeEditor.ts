import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { coachApi } from "@/lib/api/coach";

export const KNOWLEDGE_KEY = ["coach", "knowledge"] as const;

export function useKnowledgeEditor() {
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: KNOWLEDGE_KEY,
    queryFn: async () => {
      const res = await coachApi.listKnowledge();
      if (res.success && res.data) return res.data;
      throw new Error(res.error || "Failed to load knowledge");
    },
    staleTime: 0,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: KNOWLEDGE_KEY });

  const add = useMutation({
    mutationFn: ({ title, body }: { title: string; body: string }) =>
      coachApi.addKnowledge(title, body),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { title?: string; body?: string } }) =>
      coachApi.updateKnowledge(id, data),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: number) => coachApi.deleteKnowledge(id),
    onSuccess: invalidate,
  });

  const reorder = useMutation({
    mutationFn: (ids: number[]) => coachApi.reorderKnowledge(ids),
    onSuccess: invalidate,
  });

  return { list, add, update, remove, reorder };
}
