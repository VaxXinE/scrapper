const express = require('express');
const cors = require('cors');
const fs = require('fs');
const puppeteer = require('puppeteer');
const puppeteer = require('puppeteer');

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});


const app = express();
const PORT = 3000;

app.use(cors());

let cachedNews = [];
let cachedCalendar = [];
let lastUpdatedNews = null;
let lastUpdatedCalendar = null;

const newsCategories = [
  'economic-news/all-economic-news',
  'economic-news/fiscal-moneter',
  'market-news/index/all-index',
  'market-news/commodity/all-commodity',
  'market-news/currencies/all-currencies',
  'analysis/analysis-market',
  'analysis/analysis-opinion',
];

const axios = require('axios');
const cheerio = require('cheerio');


async function scrapeNews() {
  console.log('Scraping news...');
  const pageLimit = 10;
  const results = [];

  try {
    for (const cat of newsCategories) {
      for (let i = 0; i < pageLimit; i++) {
        const offset = i * 10;
        const url = `https://www.newsmaker.id/index.php/en/${cat}?start=${offset}`;
        const { data } = await axios.get(url, {
          timeout: 120000,
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });

        const $ = cheerio.load(data);
        $('div.single-news-item').each((_, el) => {
          const title = $(el).find('h5.card-title a').text().trim();
          const link = 'https://www.newsmaker.id' + $(el).find('h5.card-title a').attr('href');
          const image = 'https://www.newsmaker.id' + $(el).find('img.card-img').attr('src');
          const category = $(el).find('span.category-label').text().trim();

          let date = '';
          let summary = '';

          $(el).find('p.card-text').each((_, p) => {
            const text = $(p).text().trim();
            if (/\d{1,2} \w+ \d{4}/.test(text)) {
              date = text;
            } else {
              summary = text;
            }
          });

          if (title && link && summary) {
            results.push({ title, link, image, category, date, summary });
          }
        });
      }
    }

    const seen = new Set();
    const uniqueNews = results.filter(news => {
      if (seen.has(news.link)) return false;
      seen.add(news.link);
      return true;
    });

    cachedNews = uniqueNews;
    lastUpdatedNews = new Date();
    console.log(`✅ News updated (${cachedNews.length} items)`);
  } catch (err) {
    console.error('❌ News scraping failed:', err.message);
  }
}

async function scrapeCalendar() {
  console.log('Scraping calendar with Puppeteer...');
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36');

    await page.goto('https://www.newsmaker.id/index.php/en/analysis/economic-calendar', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await page.waitForSelector('table');

    const eventsData = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tbody tr'));
      const results = [];

      for (let i = 0; i < rows.length; i++) {
        const tds = rows[i].querySelectorAll('td');
        if (tds.length < 4) continue;

        const time = tds[0].innerText.trim();
        const currency = tds[1].innerText.trim();
        const impactSpan = tds[2].querySelector('span');
        const impact = impactSpan ? impactSpan.innerText.trim() : null;
        const raw = tds[3].innerText.trim();

        // Skip invalid rows
        if (!time || !currency || !impact || !raw || raw === '-' || currency === '-' || raw.includes('2025-')) {
          continue;
        }

        const [eventLine, figuresLine] = raw.split('\n');
        const event = eventLine?.trim() || null;

        let previous = null, forecast = null, actual = null;
        if (figuresLine) {
          const prevMatch = figuresLine.match(/Previous:\s*([^|]*)/);
          const foreMatch = figuresLine.match(/Forecast:\s*([^|]*)/);
          const actMatch = figuresLine.match(/Actual:\s*([^|]*)/);
          previous = prevMatch ? prevMatch[1].trim() : '-';
          forecast = foreMatch ? foreMatch[1].trim() : '-';
          actual = actMatch ? actMatch[1].trim() : '-';
        }

        results.push({
          time,
          currency,
          impact,
          event,
          previous,
          forecast,
          actual
        });
      }
      return results;
    });

    cachedCalendar = eventsData;
    lastUpdatedCalendar = new Date();
    await browser.close();
    console.log(`✅ Calendar updated (${cachedCalendar.length} valid events)`);

  } catch (err) {
    console.error('❌ Calendar scraping failed:', err.message);
    if (browser) await browser.close();
  }
}


scrapeNews();
scrapeCalendar();

setInterval(scrapeNews, 30 * 60 * 1000);
setInterval(scrapeCalendar, 30 * 60 * 1000);

app.get('/api/all-news', (req, res) => {
  res.json({
    status: 'success',
    updatedAt: lastUpdatedNews,
    total: cachedNews.length,
    data: cachedNews,
  });
});

app.get('/api/calendar', (req, res) => {
  res.json({
    status: 'success',
    updatedAt: lastUpdatedCalendar,
    total: cachedCalendar.length,
    data: cachedCalendar,
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server ready at http://localhost:${PORT}`);
});
