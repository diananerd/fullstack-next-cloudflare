"use client";

/**
 * CollectionPickerDialog — unified tree dialog for two models:
 *
 *  mode="move"  Navigate a tree of ALL containers (folders + boards).
 *               Click "Move here" to place the item in the currently-viewed level.
 *               Breadcrumb shows the current path. Works for any item type
 *               (artwork, folder, board).
 *
 *  mode="save"  Navigate a tree of BOARDS only.
 *               Toggle checkboxes to add/remove the artwork from boards.
 *               Membership state is pre-loaded; toggling is instant.
 *
 * Both modes share: breadcrumb path navigation, inline "New" creation, lazy loading.
 */

import {
    Bookmark,
    Check,
    ChevronRight,
    FolderOpen,
    LayoutGrid,
    Loader2,
    Move,
    Plus,
} from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { CollectionNameField } from "@/modules/artworks/components/collection-name-field";
import {
    getFolderChildrenAction,
    getBoardChildrenAction,
    getArtworkBoardMembershipAction,
    createBoardAndSaveAction,
    toggleArtworkBoardAction,
    type ContainerTreeItem,
    type BoardTreeItem,
} from "@/modules/artworks/actions/save-to-board.action";
import { createCollectionAction } from "@/modules/artworks/actions/collection.action";
import { moveWorkspaceItemAction } from "@/modules/artworks/actions/move-item.action";

// ── Props ──────────────────────────────────────────────────────────────────────

interface MoveProps {
    mode: "move";
    itemId: string;
    /** Current parent container of the item (null = already at root). */
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

// ── Path segment ──────────────────────────────────────────────────────────────

type PathSegment = { id: string; name: string };

// ── Component ─────────────────────────────────────────────────────────────────

export function CollectionPickerDialog(props: CollectionPickerDialogProps) {
    const { open, onOpenChange } = props;
    const isMove = props.mode === "move";

    // Tree state
    const [path, setPath] = useState<PathSegment[]>([]); // breadcrumb
    const [containerItems, setContainerItems] = useState<ContainerTreeItem[]>(
        [],
    );
    const [boardItems, setBoardItems] = useState<BoardTreeItem[]>([]);
    const [loading, setLoading] = useState(false);

    // Save mode: pre-loaded board membership
    const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
    const [toggling, setToggling] = useState<string | null>(null);

    // Creation form
    const [creatingNew, setCreatingNew] = useState(false);
    const [newName, setNewName] = useState("");
    const [newNameError, setNewNameError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const currentParentId = path.length > 0 ? path[path.length - 1].id : null;
    const currentItemCollectionId = isMove
        ? ((props as MoveProps).currentCollectionId ?? null)
        : null;

    // ── Fetch current level ────────────────────────────────────────────────────

    const fetchLevel = useCallback(
        async (parentId: string | null) => {
            setLoading(true);
            try {
                if (isMove) {
                    const items = await getFolderChildrenAction(parentId);
                    setContainerItems(items);
                } else {
                    const items = await getBoardChildrenAction(parentId);
                    setBoardItems(items);
                }
            } finally {
                setLoading(false);
            }
        },
        [isMove],
    );

    // ── Initialize on open ────────────────────────────────────────────────────

    useEffect(() => {
        if (!open) {
            setPath([]);
            setContainerItems([]);
            setBoardItems([]);
            setSavedIds(new Set());
            setCreatingNew(false);
            setNewName("");
            setNewNameError(null);
            return;
        }

        fetchLevel(null);

        if (!isMove) {
            const artworkId = (props as SaveProps).artworkId;
            getArtworkBoardMembershipAction(artworkId).then((ids) =>
                setSavedIds(new Set(ids)),
            );
        }
    }, [open, isMove]);

    // ── Navigation ────────────────────────────────────────────────────────────

    const drillInto = async (item: ContainerTreeItem | BoardTreeItem) => {
        const newPath = [...path, { id: item.id, name: item.name }];
        setPath(newPath);
        await fetchLevel(item.id);
    };

    const navigateTo = async (index: number) => {
        if (index < 0) {
            setPath([]);
            await fetchLevel(null);
        } else {
            const newPath = path.slice(0, index + 1);
            setPath(newPath);
            await fetchLevel(newPath[newPath.length - 1].id);
        }
        setCreatingNew(false);
        setNewName("");
        setNewNameError(null);
    };

    // ── Move here ─────────────────────────────────────────────────────────────

    const handleMoveHere = () => {
        if (!isMove || isPending) return;
        startTransition(async () => {
            const result = await moveWorkspaceItemAction(
                (props as MoveProps).itemId,
                currentParentId,
            );
            if (result.success) {
                onOpenChange(false);
                if (props.mode === "move") props.onMoved?.();
            }
        });
    };

    // ── Toggle board membership ───────────────────────────────────────────────

    const handleToggle = (boardId: string) => {
        if (isMove || toggling || isPending) return;
        const artworkId = (props as SaveProps).artworkId;
        setToggling(boardId);
        startTransition(async () => {
            const result = await toggleArtworkBoardAction(artworkId, boardId);
            if (result.success) {
                setSavedIds((prev) => {
                    const next = new Set(prev);
                    if (result.saved) next.add(boardId);
                    else next.delete(boardId);
                    return next;
                });
                setBoardItems((prev) =>
                    prev.map((b) =>
                        b.id === boardId
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

    // ── Create new ────────────────────────────────────────────────────────────

    const handleCreate = () => {
        if (newNameError || !newName.trim() || isPending) return;
        startTransition(async () => {
            if (isMove) {
                // Create folder at current level, then move item into it
                const result = await createCollectionAction(
                    newName.trim(),
                    currentParentId,
                );
                if (result.success) {
                    const moveResult = await moveWorkspaceItemAction(
                        (props as MoveProps).itemId,
                        result.collectionId,
                    );
                    if (moveResult.success) {
                        onOpenChange(false);
                        if (props.mode === "move") props.onMoved?.();
                    }
                }
            } else {
                // Create board at current level, save artwork to it
                const artworkId = (props as SaveProps).artworkId;
                const result = await createBoardAndSaveAction(
                    artworkId,
                    newName.trim(),
                    currentParentId,
                );
                if (result.success) {
                    setBoardItems((prev) => [
                        {
                            id: result.collectionId,
                            name: result.name,
                            itemCount: 1,
                        },
                        ...prev,
                    ]);
                    setSavedIds(
                        (prev) => new Set([...prev, result.collectionId]),
                    );
                    setCreatingNew(false);
                    setNewName("");
                }
            }
        });
    };

    // ── Render ────────────────────────────────────────────────────────────────

    const isMoveHereDisabled =
        isPending || currentParentId === currentItemCollectionId;

    const displayItems = isMove ? containerItems : boardItems;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {isMove ? (
                            <>
                                <Move className="h-4 w-4" />
                                Move to
                            </>
                        ) : (
                            <>
                                <Bookmark className="h-4 w-4" />
                                Save to board
                            </>
                        )}
                    </DialogTitle>
                </DialogHeader>

                <div className="mt-1 flex flex-col gap-2">
                    {/* Breadcrumb */}
                    <div className="flex items-center gap-0.5 text-xs min-h-[1.5rem] flex-wrap">
                        <button
                            type="button"
                            onClick={() => navigateTo(-1)}
                            className={`h-5 w-5 flex items-center justify-center rounded transition-colors ${
                                path.length === 0
                                    ? "text-gray-700"
                                    : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                            }`}
                            aria-label="Go to root"
                        >
                            {isMove ? (
                                <FolderOpen className="h-3.5 w-3.5" />
                            ) : (
                                <LayoutGrid className="h-3.5 w-3.5" />
                            )}
                        </button>
                        {path.map((seg, i) => (
                            <span key={seg.id} className="flex items-center">
                                <ChevronRight className="h-3 w-3 text-gray-300 flex-shrink-0" />
                                <button
                                    type="button"
                                    onClick={() => navigateTo(i)}
                                    className={`px-1 py-0.5 rounded truncate max-w-[8rem] transition-colors ${
                                        i === path.length - 1
                                            ? "text-gray-800 font-medium"
                                            : "text-gray-400 hover:text-gray-700"
                                    }`}
                                >
                                    {seg.name}
                                </button>
                            </span>
                        ))}
                    </div>

                    {/* Move here button (move mode) */}
                    {isMove && (
                        <button
                            type="button"
                            onClick={handleMoveHere}
                            disabled={isMoveHereDisabled}
                            title={
                                isMoveHereDisabled && !isPending
                                    ? "Already here"
                                    : undefined
                            }
                            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            {isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Check className="h-3.5 w-3.5" />
                            )}
                            Move here
                        </button>
                    )}

                    {/* New folder/board form or trigger */}
                    {creatingNew ? (
                        <div className="flex flex-col gap-2 p-3 border border-gray-200 rounded-lg bg-gray-50">
                            <CollectionNameField
                                id="new-container-name"
                                value={newName}
                                error={newNameError}
                                onChange={(val, err) => {
                                    setNewName(val);
                                    setNewNameError(err);
                                }}
                                placeholder={
                                    isMove ? "Folder name…" : "Board name…"
                                }
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
                                    onClick={handleCreate}
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
                            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg border border-dashed border-gray-300 w-full text-left transition-colors"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            {isMove ? "New folder here" : "New board here"}
                        </button>
                    )}

                    {/* Container / board list */}
                    {loading ? (
                        <div className="flex justify-center py-6">
                            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                        </div>
                    ) : displayItems.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-3">
                            {isMove
                                ? "No sub-folders or boards here."
                                : "No boards here."}
                        </p>
                    ) : (
                        <div className="flex flex-col gap-0.5 max-h-56 overflow-y-auto">
                            {isMove
                                ? (containerItems as ContainerTreeItem[]).map(
                                      (item) => (
                                          <ContainerRow
                                              key={item.id}
                                              item={item}
                                              isPending={isPending}
                                              onDrillIn={() => drillInto(item)}
                                          />
                                      ),
                                  )
                                : (boardItems as BoardTreeItem[]).map(
                                      (board) => {
                                          const isSaved = savedIds.has(
                                              board.id,
                                          );
                                          const isToggling =
                                              toggling === board.id;
                                          return (
                                              <BoardRow
                                                  key={board.id}
                                                  item={board}
                                                  isSaved={isSaved}
                                                  isToggling={isToggling}
                                                  isPending={
                                                      isPending || !!toggling
                                                  }
                                                  onToggle={() =>
                                                      handleToggle(board.id)
                                                  }
                                                  onDrillIn={() =>
                                                      drillInto(board)
                                                  }
                                              />
                                          );
                                      },
                                  )}
                        </div>
                    )}

                    {/* Footer (save mode) */}
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

// ── Sub-components ────────────────────────────────────────────────────────────

function ContainerRow({
    item,
    isPending,
    onDrillIn,
}: {
    item: ContainerTreeItem;
    isPending: boolean;
    onDrillIn: () => void;
}) {
    const Icon = item.containerType === "folder" ? FolderOpen : LayoutGrid;
    return (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 w-full group">
            <Icon className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-700 flex-1 truncate">
                {item.name}
            </span>
            <span className="text-xs text-gray-400 flex-shrink-0">
                {item.itemCount}
            </span>
            <button
                type="button"
                onClick={onDrillIn}
                disabled={isPending}
                className="h-5 w-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                aria-label={`Open ${item.name}`}
            >
                <ChevronRight className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}

function BoardRow({
    item,
    isSaved,
    isToggling,
    isPending,
    onToggle,
    onDrillIn,
}: {
    item: BoardTreeItem;
    isSaved: boolean;
    isToggling: boolean;
    isPending: boolean;
    onToggle: () => void;
    onDrillIn: () => void;
}) {
    return (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 w-full group">
            {/* Checkbox */}
            <button
                type="button"
                onClick={onToggle}
                disabled={isPending}
                className={`h-4 w-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                    isSaved ? "bg-black border-black" : "border-gray-300"
                } disabled:opacity-50`}
            >
                {isToggling ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin text-white" />
                ) : isSaved ? (
                    <Check className="h-2.5 w-2.5 text-white" />
                ) : null}
            </button>
            <LayoutGrid className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
            {/* Clicking the name also toggles */}
            <button
                type="button"
                onClick={onToggle}
                disabled={isPending}
                className="text-sm text-gray-700 flex-1 truncate text-left"
            >
                {item.name}
            </button>
            <span className="text-xs text-gray-400 flex-shrink-0">
                {item.itemCount}
            </span>
            <button
                type="button"
                onClick={onDrillIn}
                disabled={isPending}
                className="h-5 w-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                aria-label={`Open ${item.name}`}
            >
                <ChevronRight className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}
