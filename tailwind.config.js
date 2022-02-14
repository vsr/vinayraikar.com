const colors = require("tailwindcss/colors");

module.exports = {
  content: ["./src/**/*.{njk,html,js,md}"],
  theme: {
    extend: {
      colors: {
        primary: colors.indigo,
        secondary: colors.amber,
        base: colors.neutral,
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
