"use client";

/**
 * CollectionPickerDialog — unified dialog for two distinct models:
 *
 *  mode="move"  (dir-like): Move an artwork/collection to a folder.
 *    - Single-select. Clicking a board triggers move + closes.
 *    - Shows "Root workspace" as the first option (move out of any folder).
 *    - Current parent is marked (dimmed) to avoid no-op moves.
 *
 *  mode="save"  (board/save-like): Save an artwork to one or more boards.
 *    - Multi-select with checkboxes. Toggling is instant.
 *    - Current membership pre-loaded from the DB.
 *    - "Done" closes the dialog.
 *
 * Both modes share the board list + inline "New board" creation form.
 */

import {
    Bookmark,
    Check,
    FolderOpen,
    FolderRoot,
    Loader2,
    Move,
    Plus,
} from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { CollectionNameField } from "@/modules/artworks/components/collection-name-field";
import {
    createBoardAndSaveAction,
    getArtworkBoardMembershipAction,
    getUserBoardsAction,
    toggleArtworkBoardAction,
} from "@/modules/artworks/actions/save-to-board.action";
import { moveWorkspaceItemAction } from "@/modules/artworks/actions/move-item.action";

// ── Props ─────────────────────────────────────────────────────────────────────

interface MoveProps {
    mode: "move";
    itemId: string;
    /** Current parent collection of the item (null = already at root). */
    currentCollectionId?: string | null;
    onMoved?: () => void;
}

interface SaveProps {
    mode: "save";
    artworkId: string;
}

type CollectionPickerDialogProps = (MoveProps | SaveProps) & {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

// ── Board item type ───────────────────────────────────────────────────────────

type BoardItem = {
    id: string;
    name: string;
    itemCount: number;
    visibility: string;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function CollectionPickerDialog(props: CollectionPickerDialogProps) {
    const { open, onOpenChange } = props;

    const [boards, setBoards] = useState<BoardItem[]>([]);
    const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [toggling, setToggling] = useState<string | null>(null);
    const [creatingNew, setCreatingNew] = useState(false);
    const [newName, setNewName] = useState("");
    const [newNameError, setNewNameError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const isMove = props.mode === "move";
    const itemId = isMove ? props.itemId : props.artworkId;

    // Load boards and current membership when dialog opens
    useEffect(() => {
        if (!open) {
            setCreatingNew(false);
            setNewName("");
            setNewNameError(null);
            return;
        }
        setLoading(true);
        if (isMove) {
            // Move mode: just need the list of boards (no membership checkboxes)
            getUserBoardsAction().then((collections) => {
                setBoards(collections);
                setLoading(false);
            });
        } else {
            // Save mode: need boards + which ones already contain this artwork
            Promise.all([
                getUserBoardsAction(),
                getArtworkBoardMembershipAction(props.artworkId),
            ]).then(([collections, membership]) => {
                setBoards(collections);
                setSavedIds(new Set(membership));
                setLoading(false);
            });
        }
    }, [open, isMove, isMove ? props.itemId : props.artworkId]);

    // ── Move mode: pick a destination, then move ──────────────────────────────

    const handleMove = (targetCollectionId: string | null) => {
        if (!isMove || isPending) return;
        startTransition(async () => {
            const result = await moveWorkspaceItemAction(
                itemId,
                targetCollectionId,
            );
            if (result.success) {
                onOpenChange(false);
                if (props.mode === "move") props.onMoved?.();
            }
        });
    };

    // ── Save mode: toggle membership ──────────────────────────────────────────

    const handleToggle = (collectionId: string) => {
        if (isMove || toggling || isPending) return;
        setToggling(collectionId);
        startTransition(async () => {
            const result = await toggleArtworkBoardAction(itemId, collectionId);
            if (result.success) {
                setSavedIds((prev) => {
                    const next = new Set(prev);
                    if (result.saved) next.add(collectionId);
                    else next.delete(collectionId);
                    return next;
                });
                setBoards((prev) =>
                    prev.map((b) =>
                        b.id === collectionId
                            ? {
                                  ...b,
                                  itemCount: result.saved
                                      ? b.itemCount + 1
                                      : Math.max(0, b.itemCount - 1),
                              }
                            : b,
                    ),
                );
            }
            setToggling(null);
        });
    };

    // ── Create new board + save ───────────────────────────────────────────────

    const handleCreateAndSave = () => {
        if (newNameError || !newName.trim() || isPending) return;
        startTransition(async () => {
            const result = await createBoardAndSaveAction(
                itemId,
                newName.trim(),
            );
            if (result.success) {
                const newBoard: BoardItem = {
                    id: result.collectionId,
                    name: result.name,
                    itemCount: 1,
                    visibility: "private",
                };
                setBoards((prev) => [newBoard, ...prev]);
                if (isMove) {
                    // In move mode, creating a new board and saving = move there
                    onOpenChange(false);
                    if (props.mode === "move") props.onMoved?.();
                } else {
                    // In save mode, board is created and artwork is already saved
                    setSavedIds(
                        (prev) => new Set([...prev, result.collectionId]),
                    );
                }
                setCreatingNew(false);
                setNewName("");
            }
        });
    };

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {isMove ? (
                            <>
                                <Move className="h-4 w-4" />
                                Move to folder
                            </>
                        ) : (
                            <>
                                <Bookmark className="h-4 w-4" />
                                Save to board
                            </>
                        )}
                    </DialogTitle>
                </DialogHeader>

                <div className="mt-2 flex flex-col gap-2">
                    {/* Root workspace option — move mode only */}
                    {isMove && (
                        <button
                            type="button"
                            onClick={() => handleMove(null)}
                            disabled={isPending || !props.currentCollectionId}
                            title={
                                !props.currentCollectionId
                                    ? "Already at root"
                                    : undefined
                            }
                            className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-left w-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <FolderRoot className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                            <span className="text-sm text-gray-700 flex-1">
                                Root workspace
                            </span>
                            {!props.currentCollectionId && (
                                <Check className="h-3.5 w-3.5 text-gray-400" />
                            )}
                        </button>
                    )}

                    {/* New board form or trigger */}
                    {creatingNew ? (
                        <div className="flex flex-col gap-2 p-3 border border-gray-200 rounded-lg bg-gray-50">
                            <CollectionNameField
                                id="new-board-name"
                                value={newName}
                                error={newNameError}
                                onChange={(val, err) => {
                                    setNewName(val);
                                    setNewNameError(err);
                                }}
                                placeholder="Folder name…"
                            />
                            <div className="flex gap-2 justify-end">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setCreatingNew(false);
                                        setNewName("");
                                        setNewNameError(null);
                                    }}
                                    disabled={isPending}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={handleCreateAndSave}
                                    disabled={
                                        isPending ||
                                        !newName.trim() ||
                                        !!newNameError
                                    }
                                >
                                    {isPending ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : isMove ? (
                                        "Create & move"
                                    ) : (
                                        "Create"
                                    )}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setCreatingNew(true)}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg border border-dashed border-gray-300 w-full text-left"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            New folder
                        </button>
                    )}

                    {/* Board list */}
                    {loading ? (
                        <div className="flex justify-center py-6">
                            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                        </div>
                    ) : boards.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">
                            No folders yet. Create one above.
                        </p>
                    ) : (
                        <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto">
                            {boards.map((board) => {
                                const isCurrent =
                                    isMove &&
                                    board.id === props.currentCollectionId;
                                const isSaved =
                                    !isMove && savedIds.has(board.id);
                                const isToggling = toggling === board.id;

                                return (
                                    <button
                                        key={board.id}
                                        type="button"
                                        onClick={() =>
                                            isMove
                                                ? handleMove(board.id)
                                                : handleToggle(board.id)
                                        }
                                        disabled={
                                            isPending || !!toggling || isCurrent
                                        }
                                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 text-left w-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {!isMove && (
                                            <div
                                                className={`h-4 w-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                                                    isSaved
                                                        ? "bg-black border-black"
                                                        : "border-gray-300"
                                                }`}
                                            >
                                                {isToggling ? (
                                                    <Loader2 className="h-2.5 w-2.5 animate-spin text-white" />
                                                ) : isSaved ? (
                                                    <Check className="h-2.5 w-2.5 text-white" />
                                                ) : null}
                                            </div>
                                        )}
                                        <FolderOpen className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                                        <span className="text-sm text-gray-700 flex-1 truncate">
                                            {board.name}
                                        </span>
                                        {isCurrent && (
                                            <Check className="h-3 w-3 text-gray-400" />
                                        )}
                                        {isPending && isMove && !isCurrent && (
                                            <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                                        )}
                                        {!isMove && (
                                            <span className="text-xs text-gray-400">
                                                {board.itemCount}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Footer */}
                    {!isMove && (
                        <div className="flex justify-end pt-2 border-t border-gray-100">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => onOpenChange(false)}
                            >
                                Done
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
