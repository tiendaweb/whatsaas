export const MAX_DEPTH = 5;

export type FolderSummary = {
  id: number;
  parentId: number | null;
  name: string;
  emoji: string | null;
  depth: number;
  position: number;
};

export type DocumentSummary = {
  id: number;
  folderId: number | null;
  title: string;
  slug: string;
  emoji: string | null;
  excerpt: string;
  version: number;
  position: number;
  updatedAt: string;
};

export type FolderNode = FolderSummary & {
  children: FolderNode[];
  documents: DocumentSummary[];
};

export type TreeResponse = { folders: FolderSummary[]; documents: DocumentSummary[] };

/** Arma el árbol a partir de las listas planas que devuelve /tree. */
export function buildTree(data: TreeResponse | undefined) {
  const folders = data?.folders ?? [];
  const documents = data?.documents ?? [];

  const nodes = new Map<number, FolderNode>();
  for (const folder of folders) nodes.set(folder.id, { ...folder, children: [], documents: [] });

  const roots: FolderNode[] = [];
  for (const folder of folders) {
    const node = nodes.get(folder.id)!;
    const parent = folder.parentId ? nodes.get(folder.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const rootDocuments: DocumentSummary[] = [];
  for (const document of documents) {
    const folder = document.folderId ? nodes.get(document.folderId) : null;
    if (folder) folder.documents.push(document);
    else rootDocuments.push(document);
  }

  const byPosition = (a: DocumentSummary, b: DocumentSummary) =>
    a.position - b.position || a.title.localeCompare(b.title) || a.id - b.id;
  const byName = (a: FolderNode, b: FolderNode) => a.name.localeCompare(b.name);

  const sort = (list: FolderNode[]) => {
    list.sort(byName);
    for (const node of list) {
      node.documents.sort(byPosition);
      sort(node.children);
    }
  };
  sort(roots);
  rootDocuments.sort(byPosition);

  return { roots, rootDocuments, documents };
}

/** Busca un nodo de carpeta por id en todo el árbol (recursivo). `null` = raíz (no hay nodo). */
export function findFolderNode(nodes: FolderNode[], id: number | null): FolderNode | null {
  if (id === null) return null;
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findFolderNode(node.children, id);
    if (found) return found;
  }
  return null;
}

/** Camino raíz→carpeta actual, para el breadcrumb de la vista de navegación. */
export function getBreadcrumbPath(nodes: FolderNode[], id: number | null): FolderNode[] {
  if (id === null) return [];
  const path: FolderNode[] = [];

  const walk = (list: FolderNode[]): boolean => {
    for (const node of list) {
      if (node.id === id) {
        path.push(node);
        return true;
      }
      if (walk(node.children)) {
        path.unshift(node);
        return true;
      }
    }
    return false;
  };

  walk(nodes);
  return path;
}

/** Aplica el mismo movimiento que el servidor para una actualización optimista de SWR. */
export function moveDocumentInTree(
  data: TreeResponse,
  documentId: number,
  folderId: number | null,
  position: number,
): TreeResponse {
  const moving = data.documents.find((document) => document.id === documentId);
  if (!moving) return data;

  const sourceFolderId = moving.folderId;
  const nextDocuments = data.documents.map((document) => ({ ...document }));
  const destination = nextDocuments
    .filter((document) => document.folderId === folderId && document.id !== documentId)
    .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title) || a.id - b.id);

  const targetPosition = Math.max(0, Math.min(position, destination.length));
  const optimisticMoving = nextDocuments.find((document) => document.id === documentId)!;
  optimisticMoving.folderId = folderId;
  destination.splice(targetPosition, 0, optimisticMoving);
  destination.forEach((document, index) => {
    document.position = index;
  });

  if (sourceFolderId !== folderId) {
    nextDocuments
      .filter((document) => document.folderId === sourceFolderId && document.id !== documentId)
      .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title) || a.id - b.id)
      .forEach((document, index) => {
        document.position = index;
      });
  }

  return { ...data, documents: nextDocuments };
}
