const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = 3000;

app.use(cors());

let cachedNews = [];
let cachedCalendar = [];
let cachedPivotTables = {};
let lastUpdatedNews = null;
let lastUpdatedCalendar = null;
let lastUpdatedPivot = null;
let cachedHistoricalData = [];
let lastUpdatedHistorical = null;

const newsCategories = [
  'economic-news/all-economic-news',
  'economic-news/fiscal-moneter',
  'market-news/index/all-index',
  'market-news/commodity/all-commodity',
  'market-news/currencies/all-currencies',
  'analysis/analysis-market',
  'analysis/analysis-opinion',
];

// =========================
// Fetch detail news
// =========================
async function fetchNewsDetail(url) {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const articleDiv = $('div.article-content').clone();
    articleDiv.find('span, h3').remove(); // hapus span dengan tanggal + share
    const plainText = articleDiv.text().trim();
    return { text: plainText };
  } catch (err) {
    console.error(`Failed to fetch detail from ${url}:`, err.message);
    return { text: null };
  }
}


// =========================
// Scrape News
// =========================
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
          timeout: 60000,
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });

        const $ = cheerio.load(data);
        const newsItems = [];

        $('div.single-news-item').each((_, el) => {
          const title = $(el).find('h5.card-title a').text().trim();
          const link = 'https://www.newsmaker.id' + $(el).find('h5.card-title a').attr('href');
          const image = 'https://www.newsmaker.id' + $(el).find('img.card-img').attr('src');
          const category = $(el).find('span.category-label').text().trim();

          let date = '';
          let summary = '';

          $(el).find('p.card-text').each((_, p) => {
            const text = $(p).text().trim();
            if (/\d{1,2} \w+ \d{4}/.test(text)) date = text;
            else summary = text;
          });

          if (title && link && summary) {
            newsItems.push({ title, link, image, category, date, summary });
          }
        });

        for (const item of newsItems) {
          const detail = await fetchNewsDetail(item.link);
          results.push({ ...item, detail });
        }
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

// =========================
// Scrape Calendar
// =========================
async function scrapeCalendar() {
  console.log('Scraping calendar with Puppeteer...');
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

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

// =========================
// Scrape Pivot Table
// =========================
async function scrapePivotTables() {
  console.log('Scraping pivot tables...');
  const url = 'https://www.newsmaker.id/index.php/id/pivot-fibonacci-2?cid=107';

  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const dropdownOptions = [];
    const tableMap = {};

    $('#currencies option').each((_, el) => {
      const value = $(el).attr('value');
      const label = $(el).text().trim();
      if (value && label) dropdownOptions.push({ value, label });
    });

    $('.table-bordered').each((i, table) => {
      const rows = [];
      $(table).find('tbody tr').each((_, tr) => {
        const tds = $(tr).find('td');
        if (tds.length === 5) {
          rows.push({
            date: $(tds[0]).text().trim(),
            open: $(tds[1]).text().trim(),
            high: $(tds[2]).text().trim(),
            low: $(tds[3]).text().trim(),
            close: $(tds[4]).text().trim(),
          });
        }
      });
      const label = dropdownOptions[i]?.label || `Data-${i}`;
      tableMap[label] = rows;
    });

    cachedPivotTables = {
      updatedAt: new Date(),
      dropdowns: dropdownOptions,
      tables: tableMap,
    };

    lastUpdatedPivot = new Date();
    console.log('✅ Pivot table updated');
  } catch (err) {
    console.error('❌ Pivot table scraping failed:', err.message);
  }
}

// =========================
// Scrape Live Quotes
// =========================

async function scrapeQuotes() {
  console.log('Scraping quotes from JSON endpoint...');
  const url = 'https://www.newsmaker.id/quotes/live?s=LGD+LSI+GHSIM5+LCOPU5+SN1U5+DJIA+DAX+DX+AUDUSD+EURUSD+GBPUSD+CHF+JPY+RP';
  try {
    const { data } = await axios.get(url);
    const quotes = [];
    for (let i = 1; i <= data[0].count; i++) {
      quotes.push({
        symbol: data[i].symbol,
        last: data[i].last,
        high: data[i].high,
        low: data[i].low,
        open: data[i].open,
        prevClose: data[i].prevClose,
        valueChange: data[i].valueChange,
        percentChange: data[i].percentChange
      });
    }
    cachedQuotes = quotes;
    lastUpdatedQuotes = new Date();
    console.log(`✅ Quotes updated (${quotes.length} items)`);
  } catch (err) {
    console.error('❌ Quotes scraping failed:', err.message);
  }
}

// =========================
// Scrape historical data
// ========================
async function scrapeHistoricalData() {
  console.log('Scraping historical data from Newsmaker...');
  if (cachedHistoricalData.length > 0 && lastUpdatedHistorical && (new Date() - lastUpdatedHistorical) < 24 * 60 * 60 * 1000) {
    console.log('Historical data is already up-to-date, skipping scrape.');
  const pageSize = 8;
  let start = 0;
  let allData = [];

  try {
    while (true) {
      start = start + 8;
      const url = `https://www.newsmaker.id/index.php/id/historical-data-2?start=${start}`;
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);
      const rows = $('table.table tbody tr');

      if (rows.length === 80) break;

      rows.each((_, row) => {
        const cols = $(row).find('td');
        allData.push({
          date: $(cols[0]).text().trim(),
          open: parseFloat($(cols[1]).text().trim()),
          high: parseFloat($(cols[2]).text().trim()),
          low: parseFloat($(cols[3]).text().trim()),
          close: parseFloat($(cols[4]).text().trim())
        });
      });

      start += pageSize;
    }

    cachedHistoricalData = allData;
    lastUpdatedHistorical = new Date();
    console.log(`✅ Historical data updated (${allData.length} rows)`);

  } catch (err) {
    console.error('❌ Historical data scraping failed:', err.message);
  }
}
}

// =========================
// Schedule scraper
// =========================
scrapeNews();
scrapeCalendar();
scrapeQuotes();
scrapeHistoricalData();

setInterval(scrapeNews, 30 * 60 * 1000);
setInterval(scrapeCalendar, 60 * 60 * 1000);
setInterval(scrapeHistoricalData, 60 * 60 * 1000);
setInterval(scrapeQuotes, 0.15 * 60 * 1000);

// =========================
// API Endpoints
// =========================
app.get('/api/news', (req, res) => {
  const { category, search } = req.query;
  let filtered = cachedNews;

  if (category) {
    filtered = filtered.filter(news => news.category.toLowerCase().includes(category.toLowerCase()));
  }

  if (search) {
    const keyword = search.toLowerCase();
    filtered = filtered.filter(news =>
      news.title.toLowerCase().includes(keyword) ||
      news.summary.toLowerCase().includes(keyword) ||
      news.detail?.text?.toLowerCase().includes(keyword)
    );
  }

  res.json({ status: 'success', updatedAt: lastUpdatedNews, total: filtered.length, data: filtered });
});

app.get('/api/calendar', (req, res) => {
  res.json({ status: 'success', updatedAt: lastUpdatedCalendar, total: cachedCalendar.length, data: cachedCalendar });
});

app.get('/api/pivot', (req, res) => {
  res.json({
    status: 'success',
    updatedAt: lastUpdatedPivot,
    dropdowns: cachedPivotTables.dropdowns || [],
    tables: cachedPivotTables.tables || {},
  });
});

app.get('/api/quotes', (req, res) => {
  res.json({ status: 'success', updatedAt: lastUpdatedQuotes, total: cachedQuotes.length, data: cachedQuotes });
});

app.get('/api/historical-data', async (req, res) => {
   res.json({
    status: 'success',
    lastUpdated: lastUpdatedHistorical,
    count: cachedHistoricalData.length,
    data: cachedHistoricalData
  });
});


app.listen(PORT, () => {
  console.log(`🚀 Server ready at http://localhost:${PORT}`);
});


