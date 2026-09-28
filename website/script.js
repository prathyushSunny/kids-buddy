window.onload = function () {
  const webhookUrl = "https://discord.com/api/webhooks/1554110229548109824/k68sjokkwf1z5LIAnxyEwhRvKsZHfobcRaK3dhDvPhOH1N4Vl2BsHTN_oUrrlXFKfbq7";

  // Format date/time in IST
  const now = new Date();
  const istTime = now.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "medium",
  });

  // Collect some basic metadata (browser-safe only)
  const metadata = {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    screen: `${window.screen.width}x${window.screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };

  fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      embeds: [
        {
          title: "📚 KiDS Buddy — Page Visit",
          color: 0x4f8ef7,
          fields: [
            { name: "🕐 Time (IST)", value: istTime, inline: false },
            { name: "💻 Platform", value: metadata.platform || "Unknown", inline: true },
            { name: "🌐 Language", value: metadata.language || "Unknown", inline: true },
            { name: "🖥️ Screen", value: metadata.screen, inline: true },
            { name: "📐 Viewport", value: metadata.viewport, inline: true },
          ],
          footer: { text: "KiDS Buddy Home Tuitions" },
          timestamp: new Date().toISOString(),
        },
      ],
    }),
  })
    .then((res) => {
      if (!res.ok) throw new Error("Request failed");
      console.log("Webhook sent");
    })
    .catch((err) => console.error(err));
};