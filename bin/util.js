let _url = require("url");
let rssParser = require("rss-parser");
let { promisify } = require("util");
let stream = require("stream");
let path = require("path");
let fs = require("fs");
let got = require("got");
let filenamify = require("filenamify");
let dayjs = require("dayjs");

let { logError, logErrorAndExit } = require("./validate");

let pipeline = promisify(stream.pipeline);
let parser = new rssParser({
  defaultRSS: 2.0,
});

let logFeedInfo = (feed) => {
  console.log(`Title: ${feed.title}`);
  console.log(`Description: ${feed.description}`);
  console.log(`Total Episodes: ${feed.items ? feed.items.length : 0}`);
};

let logItemsList = (items) => {
  let tableData = items.map((item) => {
    let { title, pubDate } = item;

    return {
      title,
      pubDate,
    };
  });

  console.table(tableData);
};

let logItemInfo = (item) => {
  let { title, pubDate } = item;

  console.log(`Title: ${title}`);
  console.log(`Publish Date: ${pubDate}`);
};

let writeFeedMeta = ({ outputPath, feed }) => {
  let title = feed.title || null;
  let description = feed.description || null;
  let link = feed.link || null;
  let feedUrl = feed.feedUrl || null;
  let managingEditor = feed.managingEditor || null;

  try {
    fs.writeFileSync(
      outputPath,
      JSON.stringify(
        {
          title,
          description,
          link,
          feedUrl,
          managingEditor,
        },
        null,
        4
      )
    );
  } catch (error) {
    logError("Unable to save meta file for episode", error);
  }
};

let writeItemMeta = ({ outputPath, item }) => {
  let title = item.title || null;
  let descriptionText = item.contentSnippet || null;
  let pubDate = item.pubDate || null;
  let creator = item.creator || null;

  try {
    fs.writeFileSync(
      outputPath,
      JSON.stringify(
        {
          title,
          pubDate,
          creator,
          descriptionText,
        },
        null,
        4
      )
    );
  } catch (error) {
    logError("Unable to save meta file for episode", error);
  }
};

let getUrlExt = (url) => {
  let pathname = _url.parse(url).pathname;
  let ext = path.extname(pathname);
  return ext;
};

let VALID_AUDIO_TYPES = [".mp3", ".aac", ".m4a", ".wav", ".ogg", ".flac"];
let isAudioUrl = (url) => {
  let ext = getUrlExt(url);
  return VALID_AUDIO_TYPES.includes(ext);
};

let getEpisodeAudioUrl = ({ enclosure, link }) => {
  if (link && isAudioUrl(link)) {
    return link;
  }

  if (enclosure && isAudioUrl(enclosure.url)) {
    return enclosure.url;
  }

  return null;
};

let getEpisodeFilename = ({ title, pubDate }) => {
  let organizeDate = pubDate
    ? dayjs(new Date(pubDate)).format("YYYYMMDD")
    : null;

  let baseFileName = organizeDate ? `${organizeDate}-${title}` : title;
  let baseSafeFilename = filenamify(baseFileName, {
    replacement: "_",
  });

  return baseSafeFilename;
};

let getImageUrl = ({ image, itunes }) => {
  if (image && image.url) {
    return image.url;
  }

  if (image && image.link) {
    return image.link;
  }

  if (itunes && itunes.image) {
    return itunes.image;
  }

  return null;
};

let BYTES_IN_MB = 1000000;
let currentProgressLine = "";
let printProgress = ({ percent, total }) => {
  let percentRounded = (percent * 100).toFixed(0);
  let line = `downloading... ${percentRounded}%`;

  if (total) {
    let totalMBs = total / BYTES_IN_MB;
    let roundedTotalMbs = totalMBs.toFixed(2);
    line += ` of ${roundedTotalMbs} MB`;
  }

  if (line !== currentProgressLine) {
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(line);
    currentProgressLine = line;
  }
};

let endPrintProgress = () => {
  process.stdout.write("\n");
};

let download = async ({ url, outputPath }) => {
  await pipeline(
    got
      .stream(url)
      .on("downloadProgress", (progress) => {
        printProgress(progress);
      })
      .on("end", () => {
        endPrintProgress();
      }),
    fs.createWriteStream(outputPath)
  );
};

let getLoopControls = ({ limit, offset, length, reverse }) => {
  if (reverse) {
    let startIndex = length - 1 - offset;
    let min = limit ? Math.max(startIndex - limit, 0) : 0;
    let numItemsToDownload = startIndex - min;
    let limitCheck = (i) => i > min;
    let decrement = (i) => i - 1;

    return {
      startIndex,
      numItemsToDownload,
      limitCheck,
      next: decrement,
    };
  }

  let startIndex = 0 + offset;
  let max = limit ? Math.min(startIndex + limit, length) : length;
  let numItemsToDownload = max - startIndex;
  let limitCheck = (i) => i < max;
  let increment = (i) => i + 1;

  return {
    startIndex,
    numItemsToDownload,
    limitCheck,
    next: increment,
  };
};

let getFeed = async (url) => {
  let { href } = _url.parse(url);

  let feed;
  try {
    feed = await parser.parseURL(href);
  } catch (err) {
    logErrorAndExit("Unable to parse RSS URL", err);
  }

  return feed;
};

module.exports = {
  download,
  getEpisodeAudioUrl,
  getEpisodeFilename,
  getFeed,
  getImageUrl,
  getLoopControls,
  getUrlExt,
  logFeedInfo,
  logItemInfo,
  logItemsList,
  writeFeedMeta,
  writeItemMeta,
};
