import { WebhookClient, ComponentType, ButtonStyle, type Webhook, Client, Events, GatewayIntentBits, TextChannel } from 'discord.js';
import { writeFile } from "node:fs/promises";
import { scrapePosts, type Post } from "./scrapeyt.ts";

const dataWebhook = new WebhookClient({ url: process.env.dataWebhook! });
const fetchDataMessage = async () => await dataWebhook.fetchMessage("1398389736833548289");
const webhookClient = new WebhookClient({ url: process.env.webhook! });
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.on(Events.ClientReady, readyClient => {
  console.log(`Logged in as ${readyClient.user.tag}!`);
});

client.login(process.env.token);

export const formatNews = (raw: string): string => {
  const lines: string[] = raw
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // first line can be "NAME DATE" or "NAME - DATE"
  const headerMatch: RegExpMatchArray | null = lines[0]!.match(
    /^(\S+)\s*-?\s*(\d{4}\.\d{1,2}\.\d{1,2})$/
  );
  if (!headerMatch) {
    throw new Error('Invalid header format – expected "NAME YYYY.MM.DD" or "NAME - YYYY.MM.DD"');
  }

  const [, newsName, newsDate]: string[] = headerMatch;

  // spin emoji (swap ID if yours differs per newsName)
  const spinEmoji = `<a:MJV_${newsName}spin:1275203664277016657>`;

  const titleLine: string = `# ${spinEmoji}${newsName}${spinEmoji}`;
  const dateLine: string = `## ${newsDate}`;

  const digitEmoji: Record<string, string> = {
    '1': '<:MJV_1:1403666931059261590>',
    '2': '<:MJV_2:1403666934666362953>',
    '3': '<:MJV_3:1403666936067264512>',
    '4': '<:MJV_4:1403666937170366547>',
    '5': '<:MJV_5:1403666938772852746>',
    '6': '<:MJV_6:1403666940244918311>',
    '7': '<:MJV_7:1403666942237216798>',
    '8': '<:MJV_8:1403666943570870363>',
    '9': '<:MJV_9:1403666975581802619>',
    '0': '<:MJV_0:1403666929511698545>',
  };

  const items: string[] = [];

  for (const line of lines.slice(1)) {
    // Case: standalone UPDATE
    const updateMatch = line.match(/^UPDATE\s*:\s*(.+)$/i);
    if (updateMatch) {
      const [, updateText] = updateMatch;
      items.push(`**UPDATE :** ${updateText!.trim()}`);
      continue;
    }

    // Otherwise, numbered item
    // First try "1 : CATEGORY : text"
    let m = line.match(/^(\d+)\s*:\s*([^:]+?)\s*:\s*(.+)$/);
    let numStr: string, category: string | null, text: string;

    if (m && !m[2]?.trim()?.endsWith("http") && !m[2]?.trim()?.endsWith("https")) {
      [, numStr, category, text] = m.map((s) => s.trim()) as [string, string, string, string];
    } else {
      // Then try "1 CATEGORY : text"
      m = line.match(/^(\d+)\s+([^:]+?)\s*:\s*(.+)$/);
      if (m && !m[2]?.trim()?.endsWith("http") && !m[2]?.trim()?.endsWith("https")) {
        [, numStr, category, text] = m.map((s) => s.trim()) as [string, string, string, string];
      } else {
        // Finally "1 : text" (no category)
        m = line.match(/^(\d+)\s*:\s*(.+)$/);
        if (!m) continue;
        [, numStr, text] = m.map((s) => s.trim()) as [string, string, string];
        category = null;
      }
    }

    // build bullet by mapping digits
    const bullet = numStr
      .split('')
      .map((d) => digitEmoji[d] || '')
      .join('');

    if (category) {
      items.push(`${bullet} **${category} :** ${text.trim()}`);
    } else {
      items.push(`${bullet} ${text.trim()}`);
    }
  }

  const footer: string = `============================================================

For you who are reading this outside the server and want to get informed on your server by following server announcements, you need to get Level 10 in Triorder Mijovia Boudroholm. Join here: <https://discord.gg/UkjYqDFMW4> [verification required]  
For you who are not subscribed and reading this in Discord, subscribe: <https://www.youtube.com/@Dillemia>

*Servers that support ${newsName} media on Discord: Triorder Mijovia, Triorder Finutria, Triorder Camramia, Triorder Icoland, Earferana Chornicles, Epik_evv’s basement, StillChillea, Rating Gaming Federation, Impervetica, F.R of Momdnineland, Catoria, Bamber rating gaming the goat hangout, Logy's server zone, Dustinburg Wygelia and Aldi Empire.*`;

  return [titleLine, dateLine, '', ...items, footer].join('\n\n');
};


// — example usage —
const raw = `
DLTVNEWS 2025.07.24

1 ECONOMY : Canada's inflation rate cooled slightly in June, hitting 3.1%.

2 SPORTS : The Vancouver Vipers clinched their first playoff berth in franchise history.
`;

console.log(formatNews(raw));

export interface PostContent {
  text: string;
  url?: string;
  webPageType?: string;
}
let shouldUseZWS = false;
const handleYTPost = async (post: Post, webhook: Webhook | WebhookClient, subtext?: string | null) => {
  console.log(post.postId);
  const multiImage = [];
  if (post.attachment.multiImage) {
    for (const image of post.attachment.multiImage) {
      multiImage.push({
        attachment: Buffer.from(await (await fetch(image.at(-1)!.url)).arrayBuffer()),
        name: post.postId + ".png"
      })
    }
  }
  const embed = post.attachment.poll ? [
    {
      title: "Poll",
      description: post.attachment.poll.choices.join("\n"),
      footer: {
        text: post.attachment.poll.pollType + " \u2022 " + post.attachment.poll.totalVotes
      }
    }
  ] : (post.attachment.video ? [
    {
      title: post.attachment.video.title,
      description: post.attachment.video.descriptionSnippet,
      author: post.attachment.video.owner.name ? {
        name: post.attachment.video.owner.name,
        icon_url: post.attachment.video.owner.thumbnails?.at(-1)?.url,
        url: "https://youtube.com" + post.attachment.video.owner.url
      } : undefined,
      footer: post.attachment.video.publishedTimeText ? {
        text: post.attachment.video.lengthText.long + " \u2022 " + post.attachment.video.viewCountText + " \u2022 " + post.attachment.video.publishedTimeText
      } : undefined,
      url: post.attachment.video.videoId ? "https://www.youtube.com/watch?v=" + post.attachment.video.videoId : undefined
    }
  ] : (post.attachment.quiz ? [
    {
      title: "Quiz",
      fields: post.attachment.quiz.choices.map(choice => ({
        name: (choice.isCorrect ? "\u2705" : "\u274C") + " " + choice.text,
        value: choice.explanation
      })),
      footer: {
        text: post.attachment.quiz.quizType + " \u2022 " + post.attachment.quiz.totalVotes + " \u2022 " + (post.attachment.quiz.disableChangingQuizAnswer ? "Changing quiz answer disabled" : "Changing quiz answer enabled") + " \u2022 " + (post.attachment.quiz.enableAnimation ? "Animated" : "Not animated")
      }
    }
  ] : []))
  const parsePostContent = (postContent: {
    text: string,
    url?: string,
    webPageType?: string
  }[]) => postContent.map(content => content.url ? (content.url === content.text ? content.url : `[${content.text}](https://youtube.com${content.url})`) : content.text).join("")
  let contents = "";
  if (post.content) {
    for (const content of post.content) {
      const toAdd = content.url ? (content.url === content.text ? content.url : `[${content.text}](https://youtube.com${content.url})`) : content.text;
      if (toAdd.length + (subtext?.length ?? 0) > 1990) {
        let lasti = 0;
        for (let i = 0; i < toAdd.length - 1001; i += 1000) {
          await webhook.send({
            content: toAdd.slice(i, i + 1000),
            username: post.author.name,
            avatarURL: "https:" + post.author.thumbnails.at(-1)?.url,
          })
          lasti = i;
        }
        contents = toAdd.slice(lasti + 1000, lasti + 2000)
      } else if (contents.length + toAdd.length + (subtext?.length ?? 0) > 1990) {
        await webhook.send({
          content: contents,
          username: post.author.name,
          avatarURL: "https:" + post.author.thumbnails.at(-1)?.url,
        })
        contents = "";
      };
      if (toAdd.length + (subtext?.length ?? 0) <= 1990) contents += toAdd;
    }
  }
  const webhookMessage = await webhook.send({
    content: formatNews(contents) + (subtext ? "\n-# " + subtext : ""),
    files: post.attachment.image ? [
      {
        attachment: Buffer.from(await (await fetch(post.attachment.image.at(-1)!.url)).arrayBuffer()),
        name: post.postId + ".png"
      }
    ] : multiImage,
    embeds: post.sharedPost ? [...embed, {
      title: "Shared Post",
      description: parsePostContent(post.sharedPost.content).slice(0, 4096),
      author: {
        icon_url: "https:" + post.sharedPost.author.thumbnails.at(-1)!.url,
        name: post.sharedPost.author.name,
        url: "https://youtube.com" + post.sharedPost.author.url
      },
      image: post.sharedPost.attachment.image ? {
        url: post.sharedPost.attachment.image.at(-1)!.url
      } : (post.sharedPost.attachment.multiImage ? {
        url: post.sharedPost.attachment.multiImage[0]!.at(-1)!.url
      } : undefined),
      fields: post.sharedPost.attachment.multiImage ? [
        {
          name: "Images",
          value: post.sharedPost.attachment.multiImage.map(image => image.at(-1)!.url).join("\n\n")
        }
      ] : undefined,
      url: "https://www.youtube.com/post/" + post.sharedPost.postId
    }] : embed,
    username: post.author.name + (shouldUseZWS ? " ." : ""),
    avatarURL: "https:" + post.author.thumbnails.at(-1)?.url,
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            style: ButtonStyle.Link,
            url: "https://www.youtube.com/post/" + post.postId,
            label: "Original Post"
          }
        ]
      }
    ]
  })
  const message = await (await client.channels.fetch("1217494766397296771") as TextChannel).messages.fetch(webhookMessage.id);
  if (message.crosspostable) {
    await message.crosspost();
    await (await client.channels.fetch("1298636053552300052") as TextChannel).send("<@&1216817149335703572>");
  }
}

setInterval(async () => {
  const posts = await scrapePosts("UCAv7n_0TS3MbP3OdisnuM7A", true);
  const previousLast = (await fetchDataMessage()).content;
  const newPosts = [];
  for (const post of posts.posts) {
    if (post.postId === previousLast) break;
    newPosts.push(post);
  }
  newPosts.reverse();
  console.log(newPosts.length)
  await writeFile("newPosts.json", JSON.stringify(newPosts, null, 4))

  for (const post of newPosts) {
    await handleYTPost(post, webhookClient);
    shouldUseZWS = !shouldUseZWS;
  }

  if (newPosts.at(-1)?.postId) await dataWebhook.editMessage("1398389736833548289", newPosts.at(-1)!.postId);
}, 60000);

Bun.serve({
  port: 3000,
  fetch(req) {
  return new Response("The sending to DC web service is active.");
  }
});
