/**
 * `profile_follows` has been superseded by node_relations type 'follows'.
 * profile --[follows]--> profile
 *
 * This file is kept as a compat stub so existing type imports don't break.
 */
export type ProfileFollow = {
    id: number;
    followerUserId: string;
    followingOrganizationId: string;
    createdAt: string;
};
export type NewProfileFollow = Omit<ProfileFollow, "id" | "createdAt">;
