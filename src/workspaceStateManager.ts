import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface WorkspaceState {
    fabricRunning: boolean;
    lastStartTime?: number;
    spaceIds?: {
        spaceOwner?: string;
        user?: string;
        kms?: string;
    };
    libraryIds?: string[];
    contentObjects?: string[];
}

export class WorkspaceStateManager {
    private context: vscode.ExtensionContext;
    private workspaceStateFile: string | null = null;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;

        // Get workspace-specific state file
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            const stateDir = path.join(workspaceFolder.uri.fsPath, '.vscode');
            if (!fs.existsSync(stateDir)) {
                fs.mkdirSync(stateDir, { recursive: true });
            }
            this.workspaceStateFile = path.join(stateDir, 'elv-fabric-state.json');
        }
    }

    /**
     * Load workspace state from disk
     */
    public loadState(): WorkspaceState {
        const defaultState: WorkspaceState = {
            fabricRunning: false,
            spaceIds: {},
            libraryIds: [],
            contentObjects: []
        };

        // Try to load from workspace file
        if (this.workspaceStateFile && fs.existsSync(this.workspaceStateFile)) {
            try {
                const data = fs.readFileSync(this.workspaceStateFile, 'utf8');
                const state = JSON.parse(data);
                return { ...defaultState, ...state };
            } catch (error) {
                console.error(`Failed to load workspace state: ${error}`);
            }
        }

        // Fallback to VS Code workspace state
        const workspaceState = this.context.workspaceState.get<WorkspaceState>('fabricState');
        if (workspaceState) {
            return { ...defaultState, ...workspaceState };
        }

        return defaultState;
    }

    /**
     * Save workspace state to disk
     */
    public saveState(state: WorkspaceState): void {
        // Save to workspace file
        if (this.workspaceStateFile) {
            try {
                fs.writeFileSync(
                    this.workspaceStateFile,
                    JSON.stringify(state, null, 2),
                    'utf8'
                );
            } catch (error) {
                console.error(`Failed to save workspace state: ${error}`);
            }
        }

        // Also save to VS Code workspace state as backup
        this.context.workspaceState.update('fabricState', state);
    }

    /**
     * Update specific fields in the state
     */
    public updateState(updates: Partial<WorkspaceState>): void {
        const currentState = this.loadState();
        const newState = { ...currentState, ...updates };
        this.saveState(newState);
    }

    /**
     * Get specific state value
     */
    public getState<K extends keyof WorkspaceState>(key: K): WorkspaceState[K] {
        const state = this.loadState();
        return state[key];
    }

    /**
     * Clear all workspace state
     */
    public clearState(): void {
        const emptyState: WorkspaceState = {
            fabricRunning: false,
            spaceIds: {},
            libraryIds: [],
            contentObjects: []
        };
        this.saveState(emptyState);
    }

    /**
     * Add a space ID to the state
     */
    public addSpaceId(type: 'spaceOwner' | 'user' | 'kms', spaceId: string): void {
        const state = this.loadState();
        if (!state.spaceIds) {
            state.spaceIds = {};
        }
        state.spaceIds[type] = spaceId;
        this.saveState(state);
    }

    /**
     * Add a library ID to the state
     */
    public addLibraryId(libraryId: string): void {
        const state = this.loadState();
        if (!state.libraryIds) {
            state.libraryIds = [];
        }
        if (!state.libraryIds.includes(libraryId)) {
            state.libraryIds.push(libraryId);
        }
        this.saveState(state);
    }

    /**
     * Add a content object ID to the state
     */
    public addContentObject(objectId: string): void {
        const state = this.loadState();
        if (!state.contentObjects) {
            state.contentObjects = [];
        }
        if (!state.contentObjects.includes(objectId)) {
            state.contentObjects.push(objectId);
        }
        this.saveState(state);
    }

    /**
     * Get all space IDs
     */
    public getSpaceIds(): { spaceOwner?: string; user?: string; kms?: string } {
        const state = this.loadState();
        return state.spaceIds || {};
    }

    /**
     * Get all library IDs
     */
    public getLibraryIds(): string[] {
        const state = this.loadState();
        return state.libraryIds || [];
    }

    /**
     * Get all content object IDs
     */
    public getContentObjects(): string[] {
        const state = this.loadState();
        return state.contentObjects || [];
    }

    /**
     * Check if fabric was running when workspace was last closed
     */
    public wasFabricRunning(): boolean {
        const state = this.loadState();
        return state.fabricRunning || false;
    }

    /**
     * Mark fabric as running
     */
    public setFabricRunning(running: boolean): void {
        this.updateState({
            fabricRunning: running,
            lastStartTime: running ? Date.now() : undefined
        });
    }
}
