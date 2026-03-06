/**
 * Feature flags for optional services layered on top of the core artworks platform.
 * Toggle here to enable/disable entire service UIs without touching business logic.
 */
export const FEATURES = {
    /**
     * Shield — AI adversarial protection service.
     * When false: hides all protection buttons, status badges, and audit trail UI.
     * The underlying pipeline code stays intact; only the frontend is gated.
     */
    shield: false,

    /**
     * Share — Google Drive–style sharing dialog.
     * Access control, people search, visibility selector, copy link.
     */
    share: false,
} as const;
