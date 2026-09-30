import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gymsApi } from "@/lib/api/gyms";
import { queryKeys } from "@/lib/query-keys";

/**
 * The user's gyms (PAT-56), most-recently-used first — the picker's default is
 * the top row. createGym resolves to the new row so the caller can select it.
 */
export function useGyms() {
    const queryClient = useQueryClient();

    const { data: gyms = [], isLoading } = useQuery({
        queryKey: queryKeys.gyms.list(),
        queryFn: async () => {
            const res = await gymsApi.list();
            if (res.success && res.data) return res.data;
            return [];
        },
    });

    const createGym = useMutation({
        mutationFn: async (name: string) => {
            const res = await gymsApi.create(name);
            if (res.success && res.data) return res.data;
            throw new Error(res.error ?? "Failed to add the gym");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.gyms.all });
        },
    });

    return { gyms, isLoading, createGym, isCreating: createGym.isPending };
}
