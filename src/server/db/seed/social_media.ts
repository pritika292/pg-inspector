import type { ClientBase } from "pg";
import type { Faker } from "@faker-js/faker";
import { bulkInsert, pickN, uniqueEmail } from "./faker.js";

const N_USERS = 1000;
const N_COMMUNITIES = 200;
const N_SUBSCRIPTIONS = 5000;
const N_POSTS = 3000;
const N_COMMENTS = 6000;
const N_VOTES = 20000;

const TOPIC_WORDS = [
  "rust",
  "postgres",
  "haskell",
  "kubernetes",
  "k8s_real_talk",
  "neovim",
  "tea",
  "minimalism",
  "watches",
  "mechanical_keyboards",
  "indie_dev",
  "supabase_unfiltered",
  "early_retirement",
  "soylent",
  "synth_diy",
  "te_only",
  "aurora",
  "ferments",
];

function makeHandle(rng: Faker): string {
  const a = rng.helpers.arrayElement([
    "cosmic",
    "taco",
    "polar",
    "lossy",
    "frosted",
    "neon",
    "muted",
    "lazy",
    "burnt",
    "spicy",
  ]);
  const b = rng.helpers.arrayElement([
    "engineer",
    "wanderer",
    "thinker",
    "tinkerer",
    "weaver",
    "monk",
    "lurker",
    "scribe",
  ]);
  return `${a}_${b}_${rng.number.int({ min: 100, max: 9999 })}`;
}

export async function seedSocialMedia(
  client: ClientBase,
  rng: Faker,
  ftAccountIds: number[],
): Promise<void> {
  // sm_identity.users — 30% get a soft ref to ft_ledger.accounts.
  // Handles need to be unique too; suffix with the index when faker collides.
  const usedHandles = new Set<string>();
  const userRows = Array.from({ length: N_USERS }, (_, i) => {
    const paymentRef =
      rng.number.float({ min: 0, max: 1 }) < 0.3
        ? (ftAccountIds[rng.number.int({ min: 0, max: ftAccountIds.length - 1 })] ?? null)
        : null;
    let handle = makeHandle(rng);
    while (usedHandles.has(handle)) handle = `${handle}_${i}`;
    usedHandles.add(handle);
    return [
      handle,
      rng.person.fullName(),
      uniqueEmail(rng, `sm${i}`),
      rng.date.past({ years: 5 }),
      rng.number.int({ min: 0, max: 50_000 }),
      paymentRef,
    ];
  });
  await bulkInsert(
    client,
    "sm_identity.users",
    ["handle", "display_name", "email", "created_at", "karma", "payment_account_id"],
    userRows,
  );

  // sm_communities.communities
  const usedSlugs = new Set<string>();
  const communityRows: unknown[][] = [];
  while (communityRows.length < N_COMMUNITIES) {
    const root = rng.helpers.arrayElement(TOPIC_WORDS);
    const slug = `${root}_${rng.number.int({ min: 1, max: 999 })}`;
    if (usedSlugs.has(slug)) continue;
    usedSlugs.add(slug);
    communityRows.push([
      slug,
      slug.replaceAll("_", " "),
      rng.lorem.sentence(),
      rng.date.past({ years: 4 }),
      rng.number.int({ min: 10, max: 200_000 }),
    ]);
  }
  await bulkInsert(
    client,
    "sm_communities.communities",
    ["slug", "name", "description", "created_at", "subscriber_count"],
    communityRows,
  );

  // sm_communities.subscriptions — composite PK requires uniqueness
  const subsSeen = new Set<string>();
  const subsRows: unknown[][] = [];
  while (subsRows.length < N_SUBSCRIPTIONS) {
    const u = rng.number.int({ min: 1, max: N_USERS });
    const c = rng.number.int({ min: 1, max: N_COMMUNITIES });
    const key = `${u}-${c}`;
    if (subsSeen.has(key)) continue;
    subsSeen.add(key);
    subsRows.push([u, c, rng.date.recent({ days: 365 })]);
  }
  await bulkInsert(
    client,
    "sm_communities.subscriptions",
    ["user_id", "community_id", "subscribed_at"],
    subsRows,
  );

  // sm_content.posts — skewed: top 50 communities get most of the volume
  const postCommunityIdxs = pickN(rng, N_COMMUNITIES, N_POSTS, { skew: 3 });
  const postRows = postCommunityIdxs.map((cIdx) => [
    cIdx + 1,
    rng.number.int({ min: 1, max: N_USERS }),
    rng.lorem.sentence({ min: 3, max: 12 }),
    rng.lorem.paragraph(),
    rng.date.recent({ days: 60 }),
    rng.number.int({ min: -5, max: 5000 }),
  ]);
  await bulkInsert(
    client,
    "sm_content.posts",
    ["community_id", "author_id", "title", "body", "created_at", "score"],
    postRows,
  );

  // sm_content.comments — ~30% reply-comments (parent_comment_id set)
  // Insert in two passes so replies can reference earlier comment ids.
  const N_TOP = Math.floor(N_COMMENTS * 0.7);
  const topRows = Array.from({ length: N_TOP }, () => [
    rng.number.int({ min: 1, max: N_POSTS }),
    null,
    rng.number.int({ min: 1, max: N_USERS }),
    rng.lorem.sentences({ min: 1, max: 3 }),
    rng.date.recent({ days: 30 }),
    rng.number.int({ min: -3, max: 200 }),
  ]);
  await bulkInsert(
    client,
    "sm_content.comments",
    ["post_id", "parent_comment_id", "author_id", "body", "created_at", "score"],
    topRows,
  );

  const N_REPLIES = N_COMMENTS - N_TOP;
  const replyRows = Array.from({ length: N_REPLIES }, () => [
    rng.number.int({ min: 1, max: N_POSTS }),
    rng.number.int({ min: 1, max: N_TOP }), // reply to a top-level comment
    rng.number.int({ min: 1, max: N_USERS }),
    rng.lorem.sentences({ min: 1, max: 2 }),
    rng.date.recent({ days: 25 }),
    rng.number.int({ min: -3, max: 100 }),
  ]);
  await bulkInsert(
    client,
    "sm_content.comments",
    ["post_id", "parent_comment_id", "author_id", "body", "created_at", "score"],
    replyRows,
  );

  // sm_engagement.votes — skewed to popular posts
  const votePostIdxs = pickN(rng, N_POSTS, N_VOTES, { skew: 4 });
  const voteRows = votePostIdxs.map((pIdx) => [
    pIdx + 1,
    null,
    rng.number.int({ min: 1, max: N_USERS }),
    rng.helpers.weightedArrayElement([
      { weight: 80, value: 1 },
      { weight: 20, value: -1 },
    ]),
    rng.date.recent({ days: 30 }),
  ]);
  await bulkInsert(
    client,
    "sm_engagement.votes",
    ["post_id", "comment_id", "voter_id", "value", "created_at"],
    voteRows,
  );
}
