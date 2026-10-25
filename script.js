const STORAGE_KEY = 'lastSearchedCity';
const GEOCODING_API = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_API = 'https://api.open-meteo.com/v1/forecast';

const cityInput = document.getElementById('cityInput');
const searchBtn = document.getElementById('searchBtn');
const loadingEl = document.getElementById('loading');
const errorMessageEl = document.getElementById('errorMessage');
const unitToggleBtn = document.getElementById('unitToggle');
const searchForm = document.querySelector('.search-form');

const cityNameEl = document.getElementById('cityName');
const currentDateEl = document.getElementById('currentDate');
const temperatureEl = document.getElementById('temperature');
const weatherConditionEl = document.getElementById('weatherCondition');
const weatherIconEl = document.getElementById('weatherIcon');
const humidityEl = document.getElementById('humidity');
const windSpeedEl = document.getElementById('windSpeed');
const forecastContainer = document.getElementById('forecastContainer');

const forecastCards = Array.from(document.querySelectorAll('.forecast-card'));
let currentUnit = 'C';
let newestRequestId = 0;
let isLoading = false;
let lastWeatherData = null;

function setLoadingState(isActive) {
  isLoading = isActive;

  if (loadingEl) {
    loadingEl.hidden = !isActive;
    loadingEl.style.display = isActive ? 'flex' : 'none';
  }

  if (searchBtn) {
    searchBtn.disabled = isActive;
    searchBtn.setAttribute('aria-busy', String(isActive));
  }
}

function showError(message) {
  if (!errorMessageEl) {
    return;
  }

  errorMessageEl.textContent = message;
  errorMessageEl.hidden = false;
  errorMessageEl.style.display = 'block';
}

function hideError() {
  if (!errorMessageEl) {
    return;
  }

  errorMessageEl.hidden = true;
  errorMessageEl.style.display = 'none';
}

function updateUnitButton() {
  if (!unitToggleBtn) {
    return;
  }

  unitToggleBtn.textContent = currentUnit === 'C' ? '°C' : '°F';
  unitToggleBtn.setAttribute(
    'aria-label',
    currentUnit === 'C' ? 'Switch to Fahrenheit' : 'Switch to Celsius'
  );
}

function getWeatherMeta(code) {
  const map = {
    0: { description: 'Clear sky', icon: '☀️' },
    1: { description: 'Mainly clear', icon: '🌤️' },
    2: { description: 'Partly cloudy', icon: '⛅' },
    3: { description: 'Overcast', icon: '☁️' },
    45: { description: 'Fog', icon: '🌫️' },
    48: { description: 'Depositing rime fog', icon: '🌫️' },
    51: { description: 'Light drizzle', icon: '🌦️' },
    53: { description: 'Moderate drizzle', icon: '🌦️' },
    55: { description: 'Dense drizzle', icon: '🌧️' },
    56: { description: 'Freezing drizzle', icon: '🌧️' },
    57: { description: 'Heavy freezing drizzle', icon: '🌧️' },
    61: { description: 'Slight rain', icon: '🌦️' },
    63: { description: 'Moderate rain', icon: '🌧️' },
    65: { description: 'Heavy rain', icon: '🌧️' },
    66: { description: 'Light freezing rain', icon: '🌧️' },
    67: { description: 'Heavy freezing rain', icon: '🌧️' },
    71: { description: 'Light snowfall', icon: '🌨️' },
    73: { description: 'Moderate snowfall', icon: '❄️' },
    75: { description: 'Heavy snowfall', icon: '❄️' },
    77: { description: 'Snow grains', icon: '❄️' },
    80: { description: 'Rain showers', icon: '🌦️' },
    81: { description: 'Heavy rain showers', icon: '🌧️' },
    82: { description: 'Violent rain showers', icon: '⛈️' },
    85: { description: 'Snow showers', icon: '🌨️' },
    86: { description: 'Heavy snow showers', icon: '❄️' },
    95: { description: 'Thunderstorm', icon: '⛈️' },
    96: { description: 'Thunderstorm with hail', icon: '⛈️' },
    99: { description: 'Thunderstorm with heavy hail', icon: '⛈️' },
  };

  return map[Number(code)] || { description: 'Weather conditions', icon: '🌤️' };
}

function convertToFahrenheit(celsius) {
  return (celsius * 9) / 5 + 32;
}

function formatTemperature(value) {
  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return '--°';
  }

  const finalValue = currentUnit === 'C' ? numericValue : convertToFahrenheit(numericValue);
  return `${Math.round(finalValue)}°${currentUnit}`;
}

function formatDateFromApi(dateString, timezone) {
  const safeDate = dateString || '1970-01-01';
  const [year, month, day] = safeDate.split('-').map(Number);

  if (!year || !month || !day) {
    return 'Date unavailable';
  }

  const date = new Date(Date.UTC(year, month - 1, day, 12));

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: timezone || 'UTC',
  }).format(date);
}

function saveLastSearchedCity(cityName) {
  try {
    if (!cityName) {
      return;
    }

    localStorage.setItem(STORAGE_KEY, cityName);
  } catch (error) {
    console.warn('Unable to save the last searched city:', error);
  }
}

function getSavedCity() {
  try {
    const savedCity = localStorage.getItem(STORAGE_KEY);
    return savedCity && savedCity.trim() ? savedCity.trim() : '';
  } catch (error) {
    console.warn('Unable to read the saved city:', error);
    return '';
  }
}

function fetchCityCoordinates(cityName) {
  const params = new URLSearchParams({
    name: cityName,
    count: '1',
    language: 'en',
    format: 'json',
  });

  return fetch(`${GEOCODING_API}?${params.toString()}`)
    .then((response) => {
      if (!response.ok) {
        throw new Error('The city search service is unavailable right now.');
      }

      return response.json();
    })
    .then((data) => {
      if (!data.results || data.results.length === 0) {
        throw new Error(`No weather results were found for "${cityName}".`);
      }

      const result = data.results[0];

      return {
        latitude: result.latitude,
        longitude: result.longitude,
        cityName: result.name || cityName,
        country: result.country || 'Unknown country',
        timezone: result.timezone || 'UTC',
      };
    });
}

function fetchWeatherData(latitude, longitude, timezone) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    forecast_days: '3',
    timezone: 'auto',
  });

  return fetch(`${WEATHER_API}?${params.toString()}`)
    .then((response) => {
      if (!response.ok) {
        throw new Error('The weather service is unavailable right now.');
      }

      return response.json();
    })
    .then((data) => {
      if (!data || !data.current || !data.daily) {
        throw new Error('The weather response was incomplete.');
      }

      const forecast = (data.daily.time || []).map((date, index) => {
        const code = data.daily.weather_code?.[index];
        const minTemp = data.daily.temperature_2m_min?.[index];
        const maxTemp = data.daily.temperature_2m_max?.[index];

        const weatherInfo = getWeatherMeta(code);

        return {
          date,
          code,
          minTemp,
          maxTemp,
          description: weatherInfo.description,
          icon: weatherInfo.icon,
        };
      });

      return {
        currentTemperature: data.current.temperature_2m,
        humidity: data.current.relative_humidity_2m,
        windSpeed: data.current.wind_speed_10m,
        weatherCode: data.current.weather_code,
        currentTime: data.current.time,
        timezone: timezone || data.timezone || 'UTC',
        forecast,
      };
    });
}

function displayCurrentWeather(data) {
  if (!data || !cityNameEl || !currentDateEl || !temperatureEl || !weatherConditionEl || !weatherIconEl || !humidityEl || !windSpeedEl) {
    return;
  }

  const cityLabel = data.cityName ? `${data.cityName}${data.country ? `, ${data.country}` : ''}` : 'City name';
  const weatherInfo = getWeatherMeta(data.weatherCode);

  cityNameEl.textContent = cityLabel;
  currentDateEl.textContent = formatDateFromApi(data.currentTime?.slice(0, 10) || data.currentTime, data.timezone);
  temperatureEl.textContent = formatTemperature(data.currentTemperature);
  weatherConditionEl.textContent = weatherInfo.description;
  weatherIconEl.textContent = weatherInfo.icon;
  weatherIconEl.setAttribute('aria-label', `Weather icon for ${weatherInfo.description}`);
  humidityEl.textContent = `${Math.round(Number(data.humidity || 0))}%`;
  windSpeedEl.textContent = `${Math.round(Number(data.windSpeed || 0))} km/h`;
}

function createForecastCardsIfNeeded() {
  if (!forecastContainer) {
    return [];
  }

  if (forecastCards.length === 0) {
    for (let index = 0; index < 3; index += 1) {
      const card = document.createElement('article');
      card.className = 'forecast-card';
      card.innerHTML = `
        <p class="forecast-date">Date</p>
        <div class="forecast-icon" aria-hidden="true">☀️</div>
        <p class="forecast-condition">Condition</p>
        <p class="forecast-temp">
          <span class="forecast-min">Min: --°</span>
          <span class="forecast-max">Max: --°</span>
        </p>
      `;
      forecastContainer.appendChild(card);
    }
  }

  return Array.from(forecastContainer.querySelectorAll('.forecast-card'));
}

function displayForecast(forecastData) {
  const containerCards = createForecastCardsIfNeeded();

  if (!containerCards.length) {
    return;
  }

  const forecastItems = Array.isArray(forecastData) ? forecastData.slice(0, 3) : [];

  containerCards.forEach((card, index) => {
    const item = forecastItems[index];
    const dateEl = card.querySelector('.forecast-date');
    const iconEl = card.querySelector('.forecast-icon');
    const conditionEl = card.querySelector('.forecast-condition');
    const minEl = card.querySelector('.forecast-min');
    const maxEl = card.querySelector('.forecast-max');

    if (!item) {
      if (dateEl) dateEl.textContent = 'Date';
      if (iconEl) iconEl.textContent = '☀️';
      if (conditionEl) conditionEl.textContent = 'Condition';
      if (minEl) minEl.textContent = 'Min: --°';
      if (maxEl) maxEl.textContent = 'Max: --°';
      return;
    }

    const weatherInfo = getWeatherMeta(item.code);

    if (dateEl) dateEl.textContent = formatDateFromApi(item.date, lastWeatherData?.timezone || 'UTC');
    if (iconEl) iconEl.textContent = weatherInfo.icon;
    if (conditionEl) conditionEl.textContent = weatherInfo.description;
    if (minEl) minEl.textContent = `Min: ${formatTemperature(item.minTemp)}`;
    if (maxEl) maxEl.textContent = `Max: ${formatTemperature(item.maxTemp)}`;
  });
}

async function searchWeather(cityName) {
  const trimmedCity = (cityName || '').trim();

  if (!trimmedCity) {
    showError('Please enter a city name.');
    return;
  }

  const requestId = ++newestRequestId;

  hideError();
  setLoadingState(true);

  try {
    const cityInfo = await fetchCityCoordinates(trimmedCity);

    if (requestId !== newestRequestId) {
      return;
    }

    const weatherData = await fetchWeatherData(cityInfo.latitude, cityInfo.longitude, cityInfo.timezone);

    if (requestId !== newestRequestId) {
      return;
    }

    const finalData = {
      ...weatherData,
      cityName: cityInfo.cityName,
      country: cityInfo.country,
      timezone: cityInfo.timezone,
    };

    lastWeatherData = finalData;
    saveLastSearchedCity(cityInfo.cityName);

    if (cityInput) {
      cityInput.value = cityInfo.cityName;
    }

    displayCurrentWeather(finalData);
    displayForecast(finalData.forecast);
  } catch (error) {
    console.error('Weather search failed:', error);

    if (requestId !== newestRequestId) {
      return;
    }

    showError(error.message || 'Unable to load weather information. Please try again.');
  } finally {
    if (requestId === newestRequestId) {
      setLoadingState(false);
    }
  }
}

function handleUnitToggle() {
  currentUnit = currentUnit === 'C' ? 'F' : 'C';
  updateUnitButton();

  if (lastWeatherData) {
    displayCurrentWeather(lastWeatherData);
    displayForecast(lastWeatherData.forecast);
  }
}

function initializeApp() {
  updateUnitButton();
  hideError();

  if (searchForm) {
    searchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      searchWeather(cityInput?.value || '');
    });
  }

  if (unitToggleBtn) {
    unitToggleBtn.addEventListener('click', handleUnitToggle);
  }

  const savedCity = getSavedCity();

  if (savedCity && cityInput) {
    cityInput.value = savedCity;
    searchWeather(savedCity);
  }
}

initializeApp();
