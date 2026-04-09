import { t } from "elysia";
import { ok, fail, getErrorMessage } from "../lib/api";
import type { ApiResponse, ProfileRow } from "../types";
import { getProfile, updateProfile } from "../services/profile.service.ts";

type ProfileBody = {
  weight_kg: number;
  height_cm: number;
  tdee: number;
  calories_intake: number;
  protein_target: number;
  carbs_target: number;
  fat_target: number;
  bodyweight_date?: string;
};

type AppWithProfileRoutes<TApp> = {
  get: (path: string, handler: () => Promise<ApiResponse<ProfileRow>>) => TApp;
  put: (
    path: string,
    handler: (context: {
      body: ProfileBody;
    }) => Promise<ApiResponse<ProfileRow>>,
    options: {
      body: ReturnType<typeof t.Object>;
    },
  ) => TApp;
};

export function registerProfileRoutes<TApp extends AppWithProfileRoutes<TApp>>(
  app: TApp,
): TApp {
  return app
    .get("/profile", async (): Promise<ApiResponse<ProfileRow>> => {
      try {
        return ok(await getProfile());
      } catch (error) {
        return fail(getErrorMessage(error));
      }
    })
    .put(
      "/profile",
      async ({
        body,
      }: {
        body: ProfileBody;
      }): Promise<ApiResponse<ProfileRow>> => {
        try {
          const { bodyweight_date, ...profileData } = body;
          return ok(await updateProfile(profileData, bodyweight_date));
        } catch (error) {
          return fail(getErrorMessage(error));
        }
      },
      {
        body: t.Object({
          weight_kg: t.Number(),
          height_cm: t.Number(),
          tdee: t.Number(),
          calories_intake: t.Number(),
          protein_target: t.Number(),
          carbs_target: t.Number(),
          fat_target: t.Number(),
          bodyweight_date: t.Optional(t.String()),
        }),
      },
    );
}
