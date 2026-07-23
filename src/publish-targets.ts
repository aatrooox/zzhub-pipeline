import type {
  ContentForm,
  ContentOrigin,
  PublishTarget,
  RoutePrimary,
  Target,
  TaskKind,
} from "./state";

const TASK_KINDS: TaskKind[] = ["draft", "polish", "organize", "publish", "mixed"];
const CONTENT_FORMS: ContentForm[] = ["article", "newspic", "unknown"];
const CONTENT_ORIGINS: ContentOrigin[] = ["user", "external", "unknown"];
const ROUTES: RoutePrimary[] = ["wechat-article", "wechat-newspic", "blog"];

function parseEnum<T extends string>(
  value: string,
  allowed: readonly T[],
  field: string,
): T {
  if ((allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  throw new Error(`Invalid ${field}: ${value}. Valid values: ${allowed.join(", ")}`);
}

export function parseTaskKind(value: string): TaskKind {
  return parseEnum(value, TASK_KINDS, "task kind");
}

export function parseContentForm(value: string): ContentForm {
  return parseEnum(value, CONTENT_FORMS, "content form");
}

export function parseContentOrigin(value: string): ContentOrigin {
  return parseEnum(value, CONTENT_ORIGINS, "content origin");
}

export function parseRoutePrimary(value: string, field = "route"): RoutePrimary {
  return parseEnum(value, ROUTES, field);
}

export function parseAccountName(value: string, field = "account"): string {
  const account = value.trim();
  if (!account) {
    throw new Error(`Invalid ${field}: account cannot be empty`);
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(account)) {
    throw new Error(`Invalid ${field}: ${value}`);
  }
  return account;
}

export function validatePublishTargetCompatibility(
  targets: PublishTarget[],
  contentForm: ContentForm,
): void {
  const wechatRoutes = new Set(
    targets
      .map((target) => target.route)
      .filter((route) => route !== "blog"),
  );
  if (wechatRoutes.size > 1) {
    throw new Error(
      "A workflow cannot mix wechat-article and wechat-newspic publish targets",
    );
  }
  const expectedWechatRoute = contentForm === "article"
    ? "wechat-article"
    : contentForm === "newspic"
      ? "wechat-newspic"
      : null;
  if (
    expectedWechatRoute &&
    [...wechatRoutes].some((route) => route !== expectedWechatRoute)
  ) {
    throw new Error(
      `Content form ${contentForm} is incompatible with ${[...wechatRoutes].join(", ")}`,
    );
  }
}

function resolveTargetRoute(token: string, contentForm: ContentForm): RoutePrimary {
  if (token === "wechat") {
    if (contentForm === "article") return "wechat-article";
    if (contentForm === "newspic") return "wechat-newspic";
    throw new Error("Target 'wechat' requires content form article or newspic");
  }
  return parseRoutePrimary(token, "publish target route");
}

export function parsePublishTargets(
  raw: string,
  options: { contentForm: ContentForm; defaultAccount: string },
): { targets: PublishTarget[]; intentTargets: Target[]; explicit: boolean } {
  const parts = raw.split(",").map((item) => item.trim()).filter(Boolean);
  if (parts.length === 0) {
    throw new Error("Publish targets cannot be empty");
  }

  const targets = parts.map((part) => {
    const segments = part.split("@");
    if (segments.length > 2) {
      throw new Error(`Invalid publish target: ${part}`);
    }
    const route = resolveTargetRoute(segments[0]?.trim() ?? "", options.contentForm);
    const account = parseAccountName(
      segments.length === 2 ? segments[1] ?? "" : options.defaultAccount,
      `account in target '${part}'`,
    );
    return { route, account };
  });
  validatePublishTargetCompatibility(targets, options.contentForm);
  const intentTargets = [
    ...new Set<Target>(targets.map((target) =>
      target.route === "blog" ? "blog" : "wechat")),
  ];

  return {
    targets,
    intentTargets,
    explicit: parts.length > 1 || raw.includes("@"),
  };
}

export function getStatePublishTargets(state: {
  publish_targets: PublishTarget[];
  route: { primary: RoutePrimary; extras: RoutePrimary[]; account: string };
}): PublishTarget[] {
  const targets = state.publish_targets.length > 0
    ? state.publish_targets
    : [state.route.primary, ...state.route.extras].map((route) => ({
      route,
      account: state.route.account,
    }));
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.route}@${target.account}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
