const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = 3000;



app.use(cors());

let cachedNews = [];
let cachedNewsID = [];
let cachedCalendar = [];
let cachedQuotes = [];
let lastUpdatedNews = null;
let lastUpdatedNewsID = null;
let lastUpdatedCalendar = null;
let lastUpdatedQuotes = null;


const Redis = require('ioredis');

// Gunakan variabel lingkungan untuk koneksi fleksibel
const redis = new Redis(process.env.REDIS_PUBLIC_URL || {
  host: '127.0.0.1', // Redis lokal
  port: 6379,
  retryStrategy: (times) => Math.min(times * 50, 2000) ,
});

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err) => console.error('❌ Redis error:', err));


const newsCategories = [
  'economic-news/all-economic-news',
  'economic-news/fiscal-moneter',
  'market-news/index/all-index',
  'market-news/commodity/all-commodity',
  'market-news/currencies/all-currencies',
  'analysis/analysis-market',
  'analysis/analysis-opinion',
];

async function getOrSetCache(key, fetchFn, ttlInSeconds = null) {
  const cached = await redis.get(key);
  if (cached) {
    console.log(`📦 Serving from Redis cache: ${key}`);
    return JSON.parse(cached);
  }

  const fresh = await fetchFn();
  if (ttlInSeconds) {
    await redis.set(key, JSON.stringify(fresh), 'EX', ttlInSeconds);
    console.log(`🆕 Cache set for ${key} with TTL ${ttlInSeconds}s`);
  } else {
    await redis.set(key, JSON.stringify(fresh));
    console.log(`🆕 Cache set for ${key} without TTL`);
  }
  return fresh;
}

// =========================
// Fetch detail news
// =========================
async function fetchNewsDetail(url) {
  try {
    const { data } = await axios.get(url, {
          timeout: 720000,
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
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

async function fetchNewsDetailID(url) {
  try {
    const { data } = await axios.get(url, {
          timeout: 720000,
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
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
  const pageLimit = 5;
  const results = [];

  try {
    for (const cat of newsCategories) {
      for (let i = 0; i < pageLimit; i++) {
        const offset = i * 10;
        const url = `https://www.newsmaker.id/index.php/en/${cat}?start=${offset}`;
        const { data } = await axios.get(url, {
          timeout: 720000,
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
    try {
      const keys = await redis.keys('news:*');
      if (keys.length > 0) {
        await redis.del(...keys);
        console.log(`♻️ Cleared ${keys.length} news:* cache key(s) after scraping.`);
      }
    } catch (err) {
      console.error('❌ Failed to clear news:* cache:', err.message);
    }

    console.log(`✅ News updated (${cachedNews.length} items)`);
  } catch (err) {
    console.error('❌ News scraping failed:', err.message);
  }
}

async function scrapeNewsID() {
  console.log('Scraping ID news...');
  const pageLimit = 5;
  const results = [];

  try {
    for (const cat of newsCategories) {
      for (let i = 0; i < pageLimit; i++) {
        const offset = i * 10;
        const url = `https://www.newsmaker.id/index.php/id/${cat}?start=${offset}`;
        const { data } = await axios.get(url, {
          timeout: 720000,
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
          try {
            const detail = await fetchNewsDetailID(item.link); // Sesuaikan dengan fungsi detail ID
            results.push({ ...item, detail });
          } catch (e) {
            console.error(`⚠️ Failed to fetch detail from ${item.link}:`, e.message);
          }
        }
      }
    }

    const seen = new Set();
    const uniqueNews = results.filter(news => {
      if (seen.has(news.link)) return false;
      seen.add(news.link);
      return true;
    });

    cachedNewsID = uniqueNews;
    lastUpdatedNewsID = new Date();

    try {
      const keys = await redis.keys('newsID:*');
      if (keys.length > 0) {
        await redis.del(...keys);
        console.log(`♻️ Cleared ${keys.length} newsID:* cache key(s) after scraping.`);
      }
    } catch (err) {
      console.error('❌ Failed to clear newsID:* cache:', err.message);
    }

    console.log(`✅ News ID updated (${cachedNewsID.length} items)`);
  } catch (err) {
    console.error('❌ News ID scraping failed:', err.message);
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

try {
  await redis.set('calendar:all', JSON.stringify({
    status: 'success',
    updatedAt: lastUpdatedCalendar,
    total: cachedCalendar.length,
    data: cachedCalendar
  }), 'EX', 60 * 15);

  console.log('🧠 Calendar data saved to Redis with TTL 15 minutes');
} catch (err) {
  console.error('❌ Failed to save calendar to Redis:', err.message);
}
} catch (err) {
    if (browser) await browser.close();
    console.error('❌ Calendar scraping failed:', err.message);
  }

}


// =========================
// Scrape Live Quotes
// =========================

async function scrapeQuotes() {
  console.log('Scraping quotes from JSON endpoint...');
  const url = 'https://www.newsmaker.id/quotes/live?s=LGD+LSI+GHSIN5+LCOPU5+SN1U5+DJIA+DAX+DX+AUDUSD+EURUSD+GBPUSD+CHF+JPY+RP';
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
// Historical Scraper (Multi Symbol + Pages)
// =========================

const BASE_URL = 'https://newsmaker.id/index.php/en/historical-data-2';
const MAX_CONCURRENT_SCRAPES = 10;


let cachedSymbols = null;
let cachedSymbolsTimestamp = 0;

// === UTILITY ===
// === IMPROVED PARSE NUMBER FUNCTION ===
function parseNumber(str) {
  // Handle undefined, null, or empty string
  if (str === undefined || str === null || str === '') {
    return null;
  }
  
  // Convert to string if not already
  str = String(str);
  
  // Remove commas and trim whitespace
  const cleaned = str.replace(/,/g, '').trim();
  
  // Return null for empty string after cleaning
  if (cleaned === '' || cleaned === '-') {
    return null;
  }
  
  // Parse the number
  const parsed = parseFloat(cleaned);
  
  // Return null if parsing failed (NaN)
  return isNaN(parsed) ? null : parsed;
}

// === 1. GET ALL SYMBOLS ===
async function getAllSymbols() {
  const now = Date.now();
  if (cachedSymbols && (now - cachedSymbolsTimestamp)) {
    console.log(`🟡 Using cached symbols: ${cachedSymbols.length}`);
    return cachedSymbols;
  }

  const { data } = await axios.get(BASE_URL);
  const $ = cheerio.load(data);
  const options = $('select[name="cid"] option');
  const symbols = [];

  options.each((_, el) => {
    const cid = $(el).attr('value');
    const name = $(el).text().trim();
    if (cid && name) symbols.push({ cid, name });
  });

  console.log(`✅ Fetched ${symbols.length} symbols from base URL`);
  cachedSymbols = symbols;
  cachedSymbolsTimestamp = now;
  return symbols;
}

// === 2. SCRAPE SINGLE PAGE ===
async function scrapePageForSymbol(cid, start, retries = 3, backoff = 1000) {
  try {
    const url = `${BASE_URL}?cid=${cid}&period=d&start=${start}`;
    console.log(`📄 Scraping page for cid=${cid} start=${start}`);
    const { data } = await axios.get(url, {
      timeout: 120000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    const $ = cheerio.load(data);
    
    // More specific table selector
    const table = $('table.table.table-striped.table-bordered');
    if (table.length === 0) {
      console.warn(`⚠️ No table found for cid=${cid} start=${start}`);
      return [];
    }

    // Get headers
    const headers = table.find('thead tr th')
      .map((_, el) => $(el).text().trim().toLowerCase())
      .get();
    
    // console.log(`📋 Headers for cid=${cid}:`, headers);

    // Get rows
    const rows = table.find('tbody tr');
    const result = [];

    rows.each((i, row) => {
      const $row = $(row);
      const cols = $row.find('td');
      
      // Check if this is an event row (has colspan)
      let hasColspan = false;
      cols.each((_, col) => {
        if ($(col).attr('colspan')) {
          hasColspan = true;
          return false; // break out of each loop
        }
      });
      
      if (hasColspan) {
        // Handle event rows
        const date = cols.first().text().trim();
        const event = cols.last().text().trim();
        
        result.push({
          date: date,
          event: event,
          open: null,
          high: null,
          low: null,
          close: null,
          change: null,
          volume: null,
          openInterest: null,
        });
        
        console.log(`📅 Event row found: ${date} - ${event}`);
        return;
      }

      // Regular data rows
      const textCols = cols.map((_, el) => $(el).text().trim()).get();
      
      if (textCols.length === 0) {
        console.warn(`⚠️ Empty row found for cid=${cid}`);
        return;
      }

      // Parse regular data row with flexible column handling
      const rowData = {
        date: textCols[0] || null,
        open: parseNumber(textCols[1]),
        high: parseNumber(textCols[2]),
        low: parseNumber(textCols[3]),
        close: parseNumber(textCols[4]),
        change: textCols[5] || null, // Keep as string (can be +/-)
        volume: parseNumber(textCols[6]),
        openInterest: parseNumber(textCols[7]),
      };

      // Additional validation - at least date and one price should be valid
      if (rowData.date && (rowData.open !== null || rowData.close !== null || 
                          rowData.high !== null || rowData.low !== null)) {
        result.push(rowData);
      } else {
        console.warn(`⚠️ Invalid row data for cid=${cid}:`, textCols);
      }
    });

    console.log(`✅ Scraped ${result.length} rows for cid=${cid} start=${start}`);
    
    // Log sample data for debugging
    // if (result.length > 0) {
    //   console.log(`📊 Sample row for cid=${cid}:`, result[0]);
    // }
    
    return result;
    
  } catch (err) {
    if (retries > 0) {
      console.warn(`⏳ Retry scraping cid=${cid} start=${start}, left: ${retries}, error: ${err.message}`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return scrapePageForSymbol(cid, start, retries - 1, backoff * 2);
    } else {
      console.error(`❌ Failed to scrape cid=${cid} start=${start}:`, err.message);
      return [];
    }
  }
}



// === IMPROVED SCRAPE ALL DATA FOR A SYMBOL ===
async function scrapeAllDataForSymbol(cid, maxRows = 4000) {
  console.log(`🎯 Starting complete scrape for cid=${cid} (max ${maxRows} rows)`);
  const allData = [];
  let start = 0;
  let pageCount = 0;
  let consecutiveEmptyPages = 0;
  const PAGE_SIZE = 8; // Default page size
  const MAX_PAGES_PER_SYMBOL = 500; // Safety limit

  while (true) {
    // Check if we've reached the maximum rows limit
    if (allData.length >= maxRows) {
      console.log(`🚧 Max rows limit (${maxRows}) reached for cid=${cid}`);
      break;
    }
    
    if (pageCount >= MAX_PAGES_PER_SYMBOL) {
      console.warn(`🚧 Max page limit (${MAX_PAGES_PER_SYMBOL}) reached for cid=${cid}`);
      break;
    }
    
    const pageData = await scrapePageForSymbol(cid, start);
    
    if (pageData.length === 0) {
      consecutiveEmptyPages++;
      console.log(`📭 Empty page ${consecutiveEmptyPages} for cid=${cid} at start=${start}`);
      
      if (consecutiveEmptyPages >= 3) {
        console.log(`🛑 Multiple empty pages, stopping scrape for cid=${cid}`);
        break;
      }
    } else {
      consecutiveEmptyPages = 0; // Reset counter
      
      // Add data but respect the maxRows limit
      const remainingSlots = maxRows - allData.length;
      const dataToAdd = pageData.slice(0, remainingSlots);
      allData.push(...dataToAdd);
      
      console.log(`📈 Total data so far for cid=${cid}: ${allData.length} rows`);
      
      // If we've reached the limit, stop
      if (allData.length >= maxRows) {
        console.log(`🎯 Reached max rows limit (${maxRows}) for cid=${cid}`);
        break;
      }
    }
    
    // If we got less than PAGE_SIZE, we're probably at the end
    if (pageData.length < PAGE_SIZE) {
      console.log(`🏁 Reached end of data for cid=${cid} (got ${pageData.length} rows)`);
      break;
    }

    start += PAGE_SIZE;
    pageCount++;
    
    // Add small delay to be respectful to the server
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`🎉 Completed scraping cid=${cid}: ${allData.length} total rows`);
  return allData;
}



async function scrapeAllHistoricalData() {
  console.log('📊 Scraping all historical data...');
  const symbols = await getAllSymbols();
  console.log(`🔎 Total symbols to scrape: ${symbols.length}`);
  const executing = new Set();

  async function runWithLimit(task) {
    while (executing.size >= MAX_CONCURRENT_SCRAPES) {
      await Promise.race(executing);
    }
    const p = task();
    executing.add(p);
    p.finally(() => executing.delete(p));
    return p;
  }

  await Promise.all(
    symbols.map(({ cid, name }) =>
      runWithLimit(async () => {
        console.log(`🚀 Scraping ${name} (cid=${cid})...`);
        const data = await scrapeAllDataForSymbol(cid);
        console.log(`✅ ${name}: ${data.length} rows`);

        // Store data in Redis cache per symbol
        const cacheKey = `historical:${name.toLowerCase()}:all`;
        try {
          await redis.set(cacheKey, JSON.stringify({ status: 'success', symbol: name, data, updatedAt: new Date() }), 'EX', 60 * 60 * 2);
          console.log(`💾 Cached historical data for ${name} with key ${cacheKey}`);
        } catch (err) {
          console.error(`❌ Failed to cache historical data for ${name}:`, err.message);
        }
      })
    )
  );

  console.log('🎉 All scraping completed.');
  return true;
}

  



// =========================
// Schedule scraper
// =========================
scrapeNews();
scrapeNewsID();
scrapeCalendar();
scrapeQuotes();
scrapeAllHistoricalData();

setInterval(scrapeAllHistoricalData, 60 * 60 * 1000); // Run every hour
setInterval(scrapeNews, 30 * 60 * 1000);
setInterval(scrapeNewsID, 30 * 60 * 1000);
setInterval(scrapeCalendar, 60 * 60 * 1000);
setInterval(scrapeQuotes, 0.15 * 60 * 1000);


// =========================
// API Endpoints
// =========================
app.get('/api/news', async (req, res) => {
  const { category = 'all', search = '' } = req.query;
  const cacheKey = `news:${category.toLowerCase()}:${search.toLowerCase()}`;
  try {
    const data = await getOrSetCache(cacheKey, async () => {
      let filtered = cachedNews;
      if (category !== 'all') {
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
      return { status: 'EN success', updatedAt: lastUpdatedNews, total: filtered.length, data: filtered };
    }, 1700); // TTL 5 menit

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/news-id', async (req, res) => {
  const { category = 'all', search = '' } = req.query;
  const cacheKey = `newsID:${category.toLowerCase()}:${search.toLowerCase()}`;

  try {
    const data = await getOrSetCache(cacheKey, async () => {
      let filtered = cachedNewsID;

      if (category !== 'all') {
        filtered = filtered.filter(news =>
          news.category.toLowerCase().includes(category.toLowerCase())
        );
      }

      if (search) {
        const keyword = search.toLowerCase();
        filtered = filtered.filter(news =>
          news.title.toLowerCase().includes(keyword) ||
          news.summary.toLowerCase().includes(keyword) ||
          news.detail?.text?.toLowerCase().includes(keyword)
        );
      }

      return {
        status: 'ID success',
        updatedAt: lastUpdatedNewsID,
        total: filtered.length,
        data: filtered
      };
    }, 1700); // TTL 5 menit

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.get('/api/calendar', async (req, res) => {
  try {
    const cached = await redis.get('calendar:all');
    if (cached) {
      console.log('📦 Serving calendar from Redis cache');
      return res.json(JSON.parse(cached));
    }

    // Fallback: scrape kalau cache kosong
    await scrapeCalendar();
    const freshData = {
      status: 'success',
      updatedAt: lastUpdatedCalendar,
      total: cachedCalendar.length,
      data: cachedCalendar
    };

    // Simpan ke Redis juga untuk next request
    await redis.set('calendar:all', JSON.stringify(freshData), 'EX', 60 * 60);

    res.json(freshData);
  } catch (err) {
    console.error('❌ Error in /api/calendar:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.get('/api/historical', async (req, res) => {
  try {
    // Get all keys matching historical:*
    const keys = await redis.keys('historical:*');
    if (keys.length === 0) {
      return res.status(404).json({ status: 'empty', message: 'No historical data cached yet.' });
    }

    // Fetch all cached data
    const pipeline = redis.pipeline();
    keys.forEach(key => pipeline.get(key));
    const results = await pipeline.exec();

    // Aggregate data
    const allData = [];
    results.forEach(([err, data]) => {
      if (!err && data) {
        try {
          const parsed = JSON.parse(data);
          if (parsed.data && Array.isArray(parsed.data)) {
            allData.push({ symbol: parsed.symbol, data: parsed.data, updatedAt: parsed.updatedAt });
          }
        } catch (e) {
          console.error('Error parsing cached historical data:', e.message);
        }
      }
    });

    res.json({ status: 'success', totalSymbols: allData.length, data: allData });
  } catch (err) {
    console.error('❌ Error in /api/historical:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/quotes', (req, res) => {
  res.json({ status: 'success', updatedAt: lastUpdatedQuotes, total: cachedQuotes.length, data: cachedQuotes });
});

app.delete('/api/cache', async (req, res) => {
  try {
    const { pattern } = req.query;

    // Default pattern: semua key dengan prefix "historical:"
    const keyPattern = pattern || 'historical:*';

    // Ambil semua key yang cocok
    const keys = await redis.keys(keyPattern);

    if (keys.length === 0) {
      return res.json({ message: 'No cache keys found.' });
    }

    // Hapus semua key
    await redis.del(...keys);

    res.json({ message: `🧹 ${keys.length} cache key(s) deleted.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.listen(PORT, () => {
  console.log(`🚀 Server ready at http://localhost:${PORT}`);
});


