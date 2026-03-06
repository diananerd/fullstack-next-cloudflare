export const ProfileType = {
    INDIVIDUAL: "individual",
    PSEUDONYM: "pseudonym",
    PUBLIC_FIGURE: "public_figure",
    ORGANIZATION: "organization",
    COLLECTIVE: "collective",
} as const;

export type ProfileTypeValue = (typeof ProfileType)[keyof typeof ProfileType];

export const ProfileVisibility = {
    PUBLIC: "public",
    PRIVATE: "private",
    UNLISTED: "unlisted",
} as const;

export type ProfileVisibilityValue =
    (typeof ProfileVisibility)[keyof typeof ProfileVisibility];
