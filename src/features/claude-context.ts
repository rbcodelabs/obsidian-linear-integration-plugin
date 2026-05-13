import { App, MarkdownView } from 'obsidian';
import { LinearPluginSettings, TeamSyncConfig } from '../models/types';

export interface ObsidianContext {
    vaultName: string;
    activeFile: ActiveFileContext | null;
    openFiles: OpenFileContext[];
    linearContext: LinearContext;
}

export interface ActiveFileContext {
    path: string;
    name: string;
    isLinearIssue: boolean;
    linearIdentifier?: string;
    linearStatus?: string;
    linearTeam?: string;
    frontmatter: Record<string, unknown>;
}

export interface OpenFileContext {
    path: string;
    name: string;
    isLinearIssue: boolean;
    linearIdentifier?: string;
}

export interface LinearContext {
    syncedTeams: Array<{ name: string; folder: string }>;
    hasApiKey: boolean;
}

/**
 * Builds a dynamic, Obsidian-aware system prompt for Claude agents spawned
 * by this plugin. Pulls all context from the live Obsidian app state and
 * plugin settings — nothing is hardcoded about the user's specific workflow.
 */
export class ClaudeContextBuilder {
    constructor(
        private app: App,
        private settings: LinearPluginSettings
    ) {}

    /**
     * Gather the current Obsidian state into a structured context object.
     */
    buildContext(): ObsidianContext {
        return {
            vaultName: this.app.vault.getName(),
            activeFile: this.getActiveFileContext(),
            openFiles: this.getOpenFilesContext(),
            linearContext: this.getLinearContext(),
        };
    }

    /**
     * Render a system prompt string from the current context.
     * Suitable for passing as the `system` field in a Claude API call.
     */
    buildSystemPrompt(): string {
        const ctx = this.buildContext();
        const sections: string[] = [];

        sections.push(this.renderEnvironmentSection(ctx));

        if (ctx.activeFile) {
            sections.push(this.renderActiveFileSection(ctx.activeFile));
        }

        if (ctx.openFiles.length > 0) {
            sections.push(this.renderOpenFilesSection(ctx.openFiles));
        }

        if (ctx.linearContext.syncedTeams.length > 0) {
            sections.push(this.renderLinearSection(ctx.linearContext));
        }

        sections.push(this.renderCapabilitiesSection());
        sections.push(this.renderObsidianInstructionsSection(ctx.vaultName));

        return sections.join('\n\n');
    }

    private getActiveFileContext(): ActiveFileContext | null {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return null;

        const cache = this.app.metadataCache.getFileCache(activeFile);
        const frontmatter = (cache?.frontmatter ?? {}) as Record<string, unknown>;

        const isLinearIssue = 'linear_id' in frontmatter;

        return {
            path: activeFile.path,
            name: activeFile.basename,
            isLinearIssue,
            linearIdentifier: frontmatter.linear_identifier as string | undefined,
            linearStatus: frontmatter.linear_status as string | undefined,
            linearTeam: frontmatter.linear_team as string | undefined,
            frontmatter,
        };
    }

    private getOpenFilesContext(): OpenFileContext[] {
        const results: OpenFileContext[] = [];
        const seen = new Set<string>();

        this.app.workspace.iterateAllLeaves((leaf) => {
            if (!(leaf.view instanceof MarkdownView)) return;
            const file = leaf.view.file;
            if (!file || seen.has(file.path)) return;
            seen.add(file.path);

            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatter = (cache?.frontmatter ?? {}) as Record<string, unknown>;
            const isLinearIssue = 'linear_id' in frontmatter;

            results.push({
                path: file.path,
                name: file.basename,
                isLinearIssue,
                linearIdentifier: frontmatter.linear_identifier as string | undefined,
            });
        });

        return results;
    }

    private getLinearContext(): LinearContext {
        const syncedTeams = (this.settings.teamSyncConfigs ?? [])
            .filter(c => c.enabled)
            .map((c: TeamSyncConfig) => ({ name: c.teamName, folder: c.syncFolder }));

        // Fall back to legacy single-team config
        if (syncedTeams.length === 0 && this.settings.teamId && this.settings.syncFolder) {
            syncedTeams.push({
                name: 'Default',
                folder: this.settings.syncFolder,
            });
        }

        return {
            syncedTeams,
            hasApiKey: !!this.settings.apiKey,
        };
    }

    private renderEnvironmentSection(ctx: ObsidianContext): string {
        return [
            `You are an AI assistant embedded inside Obsidian, the note-taking app, via the Linear Integration Plugin.`,
            `The user's vault is named "${ctx.vaultName}".`,
            `You have access to information about the user's open notes and their synced Linear issues.`,
            `You can help the user manage their Linear issues, draft content, triage work, and reason over their notes.`,
            `Do not fabricate Linear issue details — only reference issues visible in the context below.`,
        ].join(' ');
    }

    private renderActiveFileSection(file: ActiveFileContext): string {
        const lines = ['## Active Document'];
        lines.push(`The user currently has **${file.name}** open (path: \`${file.path}\`).`);

        if (file.isLinearIssue) {
            lines.push(`This note is a synced Linear issue.`);
            if (file.linearIdentifier) lines.push(`- **Issue:** ${file.linearIdentifier}`);
            if (file.linearStatus)     lines.push(`- **Status:** ${file.linearStatus}`);
            if (file.linearTeam)       lines.push(`- **Team:** ${file.linearTeam}`);
        }

        return lines.join('\n');
    }

    private renderOpenFilesSection(files: OpenFileContext[]): string {
        const lines = ['## Open Documents'];
        for (const f of files) {
            const label = f.isLinearIssue && f.linearIdentifier
                ? `${f.linearIdentifier} — ${f.name}`
                : f.name;
            lines.push(`- ${label} (\`${f.path}\`)`);
        }
        return lines.join('\n');
    }

    private renderLinearSection(linear: LinearContext): string {
        const lines = ['## Linear Workspace'];
        lines.push('The following Linear teams are synced into this vault:');
        for (const team of linear.syncedTeams) {
            lines.push(`- **${team.name}** → \`${team.folder}/\``);
        }
        lines.push('Each team\'s issues are stored as individual Markdown notes in their respective folder, with Linear metadata in YAML frontmatter.');
        return lines.join('\n');
    }

    private renderCapabilitiesSection(): string {
        return [
            '## What You Can Help With',
            '- Summarizing, drafting, or refining the content of the active note',
            '- Reasoning over open Linear issues (status, priority, relationships)',
            '- Suggesting next actions based on issue state',
            '- Creating new issue drafts in Obsidian note format',
            '- Answering questions about the user\'s Linear workspace based on synced notes',
        ].join('\n');
    }

    private renderObsidianInstructionsSection(vaultName: string): string {
        return [
            '## How to Open Files in Obsidian',
            'ALWAYS use the Obsidian URI scheme to open files — `open -a Obsidian <path>` does NOT work.',
            '```',
            `open "obsidian://open?vault=${encodeURIComponent(vaultName)}&file=<url-encoded-path-without-extension>"`,
            '```',
            'Rules:',
            '- Path is relative to the vault root, no leading slash, no `.md` extension',
            '- Spaces in the path → `%20`',
            '- Never use a full filesystem path with `open -a Obsidian`',
        ].join('\n');
    }
}
