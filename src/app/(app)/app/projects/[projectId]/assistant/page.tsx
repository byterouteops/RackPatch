import { Lock } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { requireSessionUser } from "@/lib/session";
import { ASSISTANT_SUGGESTIONS } from "@/lib/assistant/answer";
import { isLlmEnabled } from "@/lib/assistant/llm";
import { AssistantChat } from "@/components/assistant-chat";
import { ProjectPageHeader } from "@/components/project-page-header";
import { AlertBanner, Badge, Card, EmptyState } from "@/components/ui";

export default async function AssistantPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) {
    return (
      <EmptyState
        icon={<Lock className="h-5 w-5" aria-hidden />}
        title="Permission denied"
        description="You do not have access to this project."
      />
    );
  }

  const llm = isLlmEnabled();

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={access.project.name}
        section="Assistant"
        title="Assistant"
        description="Ask questions answered from this project's findings, evidence, and capacity."
        actions={<Badge tone={llm ? "info" : "neutral"}>{llm ? "LLM wording on" : "Rule-based"}</Badge>}
      />

      <div className="mb-4">
        <AlertBanner tone="info" title={llm ? "Rule-based + optional LLM wording" : "Rule-based answers"}>
          {llm
            ? "Answers are built from project data first. An LLM (OpenAI) may reword them using only those retrieved facts — cable IDs, device names and counts are sent to OpenAI. Answers with numbers not in the project data are discarded."
            : "Answers are built by fixed rules from project data. No language model is configured (OPENAI_API_KEY unset), so nothing leaves this server."}
        </AlertBanner>
      </div>

      <Card
        title="Ask"
        description="Chat history is kept in this browser tab only and is not saved."
      >
        <AssistantChat projectId={projectId} suggestions={ASSISTANT_SUGGESTIONS} />
      </Card>
    </div>
  );
}
