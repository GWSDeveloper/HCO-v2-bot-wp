const { createGuard } = require("../lib/guards/registry");
const { getText } = require("../lib/helpers");

const handleAntibadwordGuard = createGuard({
    key: "antibadword",
    detect(message, guardConfig) {
        if (!guardConfig.words || guardConfig.words.length === 0) return null;

        const text = getText(message).toLowerCase();
        if (!text) return null;

        for (const word of guardConfig.words) {
            const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(?:^|\\s)${escaped}(?:$|\\s|[!?.,])`, 'i');
            if (regex.test(text)) {
                return `Your message contained a blocked word.`;
            }
        }
        return null;
    }
});

module.exports = { handleAntibadwordGuard };

