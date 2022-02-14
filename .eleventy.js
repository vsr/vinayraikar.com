const { DateTime } = require("luxon");
const fs = require("fs");
const _ = require("lodash");
const striptags = require("striptags");
const pluginRss = require("@11ty/eleventy-plugin-rss");
const pluginNavigation = require("@11ty/eleventy-navigation");
const Image = require("@11ty/eleventy-img");
const markdownIt = require("markdown-it");
const markdownItAnchor = require("markdown-it-anchor");

module.exports = function (eleventyConfig) {
  async function imageShortcode(src, alt, cls, sizes) {
    let metadata = await Image(src, {
      widths: [600, 1024],
      formats: ["avif", "jpeg"],
      outputDir: "./dist/img/",
    });

    let imageAttributes = {
      class: cls,
      alt,
      sizes,
      loading: "lazy",
      decoding: "async",
    };

    // You bet we throw an error on missing alt in `imageAttributes` (alt="" works okay)
    return Image.generateHTML(metadata, imageAttributes, {
      whitespaceMode: "inline",
    });
  }

  function extractExcerpt(post) {
    if (!post.hasOwnProperty("templateContent")) {
      console.warn(
        'Failed to extract excerpt: Document has no property "templateContent".'
      );
      // console.log("failed in extraction", post);
      return null;
    }

    let excerpt = null;
    const content = post.templateContent;

    excerpt = striptags(content)
      .substring(0, 200) // Cap at 200 characters
      .replace(/^\s+|\s+$|\s+(?=\s)/g, "")
      .trim()
      .concat("...");
    return excerpt;
  }

  eleventyConfig.addPassthroughCopy({ "src/static": "./" });
  eleventyConfig.addPlugin(pluginRss);
  eleventyConfig.addPlugin(pluginNavigation);

  eleventyConfig.addShortcode("excerpt", (post) => extractExcerpt(post));

  eleventyConfig.addNunjucksAsyncShortcode("image", imageShortcode);

  eleventyConfig.addFilter("readableDate", (dateObj) => {
    return DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat(
      "dd LLL yyyy"
    );
  });

  eleventyConfig.addFilter("htmlDateString", (dateObj) => {
    return DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat("yyyy-LL-dd");
  });

  eleventyConfig.addFilter("objectkeys", (obj) => {
    return Object.keys(obj);
  });

  function filterTagList(tags) {
    return (tags || []).filter(
      (tag) => ["all", "nav", "post", "posts", "projects"].indexOf(tag) === -1
    );
  }

  eleventyConfig.addFilter("filterTagList", filterTagList);

  // Create an array of all tags
  eleventyConfig.addCollection("tagList", function (collection) {
    let tagSet = new Set();
    collection.getAll().forEach((item) => {
      // console.log("tags:", item.data.tags);
      (item.data.tags || []).forEach((tag) => tagSet.add(tag));
    });
    // console.log("tagset", tagSet);
    return filterTagList([...tagSet]);
  });

  eleventyConfig.addCollection("tagCountMap", function (collection) {
    let tagCountMap = {};
    collection.getAll().forEach((item) => {
      (item.data.tags || []).forEach((tag) => {
        if (!tagCountMap.hasOwnProperty(tag)) tagCountMap[tag] = 0;
        tagCountMap[tag] += 1;
      });
    });
    // console.log("tagCountMap", tagCountMap);
    return tagCountMap;
  });

  const postYearMonthRegex = /\/posts\/(?<year>\d{4})\/(?<month>\d{2}).*/;

  eleventyConfig.addCollection("years", function (collectionApi) {
    const years = new Set();
    collectionApi
      .getAll()
      .filter((item) => (item.data.tags || []).includes("posts"))
      .forEach((item) => {
        const {
          groups: { year },
        } = item.filePathStem.match(postYearMonthRegex);
        if (year) years.add(year);
      });
    return [...years];
  });

  eleventyConfig.addCollection("postsByYears", function (collectionApi) {
    const postsByYears = {};
    collectionApi
      .getAll()
      .filter((item) => (item.data.tags || []).includes("posts"))
      .forEach((item) => {
        const {
          groups: { year, month },
        } = item.filePathStem.match(postYearMonthRegex);
        if (year && month) {
          if (!postsByYears.hasOwnProperty(year)) postsByYears[year] = {};
          if (!postsByYears[year].hasOwnProperty(month))
            postsByYears[year][month] = [];
          postsByYears[year][month].push(item);
        }
      });
    // console.log("postsByYears", postsByYears);
    return postsByYears;
  });

  const postsByYearMonths = (collectionApi) => {
    // TODO: hacky implementation, could be improved
    const postsByYearMonths = {};
    collectionApi
      .getAll()
      .filter((item) => (item.data.tags || []).includes("posts"))
      .forEach((item) => {
        const {
          groups: { year, month },
        } = item.filePathStem.match(postYearMonthRegex);
        if (year && month) {
          const key = `${year}/${month}`;
          if (!postsByYearMonths.hasOwnProperty(key))
            postsByYearMonths[key] = { key, month, year, items: [] };
          postsByYearMonths[key].items.push(item);
        }
      });
    // console.log("postsByYearMonths", postsByYearMonths);
    return postsByYearMonths;
  };

  eleventyConfig.addCollection("postsByYearMonths", function (collectionApi) {
    return postsByYearMonths(collectionApi);
  });
  eleventyConfig.addCollection("months", function (collectionApi) {
    return Object.values(postsByYearMonths(collectionApi));
  });

  // Customize Markdown library and settings:
  let markdownLibrary = markdownIt({
    html: true,
    breaks: true,
    linkify: true,
  }).use(markdownItAnchor, {
    permalink: markdownItAnchor.permalink.ariaHidden({
      placement: "after",
      class: "direct-link",
      symbol: "#",
      level: [1, 2, 3, 4],
    }),
    slugify: eleventyConfig.getFilter("slug"),
  });
  eleventyConfig.setLibrary("md", markdownLibrary);

  eleventyConfig.addFilter("head", (array, n) => {
    if (!Array.isArray(array) || array.length === 0) {
      return [];
    }
    if (n < 0) {
      return array.slice(n);
    }

    return array.slice(0, n);
  });

  eleventyConfig.addFilter("projectssort", (projects) => {
    return _.sortBy(projects, ["data.order"]);
  });

  // Override Browsersync defaults (used only with --serve)
  eleventyConfig.setBrowserSyncConfig({
    files: ["dist/**/*.*"],
    callbacks: {
      ready: function (err, browserSync) {
        const content_404 = fs.readFileSync("dist/404.html");

        browserSync.addMiddleware("*", (req, res) => {
          // Provides the 404 content without redirect.
          res.writeHead(404, { "Content-Type": "text/html; charset=UTF-8" });
          res.write(content_404);
          res.end();
        });
      },
    },
    ui: false,
    ghostMode: false,
  });

  return {
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    dir: {
      input: "./src",
      output: "dist",
    },
  };
};
