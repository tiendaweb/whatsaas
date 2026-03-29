export type DraftStage = {
  id: string;
  name: string;
  order: number;
  departmentId?: number | null;
};

export type DraftTask = {
  id: string;
  stageId: string;
  name: string;
  order: number;
  type: 'task' | 'subtask' | 'group';
  parentTaskId?: string | null;
};

export type DraftWorkflow = {
  stages: DraftStage[];
  tasks: DraftTask[];
};

export type DraftCategory = {
  id: number;
  name: string;
  color?: string | null;
  position: number;
  workspaceKey?: string | null;
};

export type DraftTag = {
  id: number;
  name: string;
  color?: string | null;
};

export type DraftDepartment = {
  id: number;
  name: string;
};

export type DraftAgent = {
  id: number;
  name: string | null;
  email: string;
};

export type DraftContact = {
  id: number;
  name: string;
};

export type DraftItem = {
  id: number;
  title: string;
  content: string;
  categoryId: number | null;
  contactId: number | null;
  assignedUserId: number | null;
  departmentId: number | null;
  stages?: DraftWorkflow | null;
  tags: DraftTag[];
  updatedAt: string;
  category?: DraftCategory | null;
  contact?: DraftContact | null;
  assignedUser?: DraftAgent | null;
  department?: DraftDepartment | null;
};
