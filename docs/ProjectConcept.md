Yes. After searching, I think the best data strategy is:

> **Primary live signal:** COVID wastewater data
> **Secondary validation signals:** hospitalizations, deaths, test positivity
> **Historical/global context:** Our World in Data
> **Local Chicago/Illinois angle:** Illinois wastewater + Illinois DPH, but Chicago’s own COVID datasets are mostly historical/retired now.

The strongest version of the project would not be “predict COVID cases” directly. It would be:

# **A Neural ODE model that learns the hidden dynamics of COVID activity from wastewater and severity signals**

That is much more defensible, current, and visually interesting.

---

## My strongest recommendation

Use **CDC NWSS SARS-CoV-2 wastewater data** as the main dataset.

The CDC dataset is public, has CSV/JSON downloads, provides a “complete time history” of SARS-CoV-2 wastewater sample data and calculated metrics from U.S. sampling locations, and is updated weekly on Fridays. ([Data.gov][1])

That is almost exactly what you want for this project because wastewater is a community-level infection signal that does not depend on people going to the doctor or reporting home tests. CDC explicitly says wastewater can detect infections regardless of symptoms, healthcare-seeking behavior, or testing availability, and that it can detect trends before clinical testing or hospital data. ([CDC][2])

That gives you a beautiful conceptual hook:

> **The Neural ODE is learning the continuous motion of a pandemic through a community-level biological signal.**

---

# Best data sources for the project

## 1. CDC NWSS SARS-CoV-2 Wastewater Data

**Use this as the core dataset.**

It gives you wastewater measurements from sampling locations across the U.S. For a Neural ODE project, this is probably better than confirmed cases because modern case counts are distorted by home testing, reduced reporting, and changes in testing behavior.

CDC describes wastewater as useful for early detection, infection-trend tracking, and public health action; it also notes that wastewater is most useful when combined with other signals like hospital visits or clinical testing. ([CDC][2])

Data access:

```text
CDC NWSS SARS-CoV-2 wastewater CSV:
https://data.cdc.gov/api/views/j9g8-acpt/rows.csv?accessType=DOWNLOAD

CDC NWSS SARS-CoV-2 wastewater JSON:
https://data.cdc.gov/api/views/j9g8-acpt/rows.json?accessType=DOWNLOAD
```

**Why it is good:**

* Free
* Official
* Continuously updated
* Machine-readable CSV/JSON
* U.S.-wide
* Works well for time-series modeling
* More meaningful in 2026 than reported case counts

**Downside:**

* Wastewater data is noisy.
* Sampling frequency may vary by site.
* Coverage is uneven.
* Some data may be revised after publication.
* You need preprocessing: log transforms, smoothing, site filtering, missing-value handling.

Still, this is the best primary source.

---

## 2. Illinois Wastewater Surveillance System

This is very relevant because you are in Chicago/Illinois. The Illinois Wastewater Surveillance System provides public raw wastewater data from individual wastewater treatment plants, including SARS-CoV-2 concentration in gene copies per liter, sample collection date, influenza A, influenza B, RSV, and method fields. ([IWSS Dashboard][3])

Data notes from IWSS are useful because they explain detection limits. For SARS-CoV-2, they list a limit of detection of **4,080 gc/L**, and they say CDC recommends replacing non-detects with half the assay detection limit, e.g. **2,040 gc/L** for SARS-CoV-2. ([IWSS Dashboard][3])

**Why this is especially good:**

* Local Illinois focus
* Raw treatment-plant-level measurements
* Multiple respiratory pathogens, not just COVID
* Good for a “Chicago/Illinois COVID dynamics” project
* Makes the project feel personal and place-based

**Downside:**

* You may need to inspect the site’s actual data-download mechanics more carefully.
* It may be less convenient than CDC Socrata CSVs.
* Individual plant-level data can be messier than national aggregates.

My take: use **CDC NWSS first**, then use **Illinois IWSS** as a local enhancement.

---

## 3. CDC/NCHS Provisional COVID-19 Death Counts

Use this as a **lagging severity signal**, not the main model input.

CDC/NCHS has a public dataset called **“Provisional COVID-19 Death Counts by Week Ending Date and State.”** It is updated weekly on Thursdays and includes deaths involving COVID-19, pneumonia, and influenza by week-ending date and state. ([Data.gov][4])

Data access:

```text
CDC/NCHS COVID deaths by week and state CSV:
https://data.cdc.gov/api/views/r8kw-7aab/rows.csv?accessType=DOWNLOAD

CDC/NCHS COVID deaths by week and state JSON:
https://data.cdc.gov/api/views/r8kw-7aab/rows.json?accessType=DOWNLOAD
```

**Why it is useful:**

* Official
* Weekly
* State-level
* Long historical coverage
* Good as a “did wastewater increases eventually correspond to severe outcomes?” signal

**Downside:**

* Deaths lag infections.
* Recent weeks are incomplete.
* Death reporting is revised.
* Deaths are low now compared with earlier pandemic periods, so the signal may be sparse.

This is not ideal for a live “what is happening right now?” dashboard, but it is great for historical validation and lag analysis.

---

## 4. CDC RESP-NET / COVID-NET Hospitalization Data

Use this as another **severity validation layer**.

CDC’s RESP-NET monitors laboratory-confirmed hospitalizations associated with flu, COVID-19, and RSV. It is updated weekly, and CDC notes that recent hospitalization rates are subject to reporting delays and that prior weeks are updated as new data arrive. ([CDC][5])

COVID-NET specifically monitors laboratory-confirmed COVID-19-associated hospitalizations and is part of RESP-NET. CDC says these rates can be used to follow COVID hospitalization trends across demographic groups and over time. ([CDC][6])

**Why it is useful:**

* Hospitalization is more clinically meaningful than cases.
* Weekly time series are good for modeling.
* Can help show how wastewater leads hospital burden.

**Downside:**

* RESP-NET is surveillance-based, not a full census of every U.S. hospitalization.
* CDC notes it covers select counties/states and relies on clinical testing ordered by healthcare providers. ([CDC][5])

I would treat this as a validation layer, not the sole target.

---

## 5. CDC NREVSS Percent Positivity Data

Use this as a **clinical testing signal**, with caution.

CDC’s respiratory virus page says percent-positive data for SARS-CoV-2 and RSV come from NREVSS, a sentinel network of clinical, public health, and commercial labs. The data represent laboratory tests, not individual people, and recent weeks may be incomplete because of reporting delays. ([CDC][7])

Data access:

```text
CDC Percent Positivity of Viral Respiratory Pathogens:
https://data.cdc.gov/api/views/seuz-s2cv/rows.csv?accessType=DOWNLOAD
```

**Why it is useful:**

* Weekly
* Official
* Helps triangulate whether wastewater increases correspond to clinical positivity
* Can compare COVID vs flu vs RSV dynamics

**Downside:**

* Testing behavior changes over time.
* Data represents tests, not unique people.
* It misses home tests.
* It is a sentinel-lab signal, not total community incidence.

Use it as context, not the ground truth.

---

## 6. Our World in Data COVID Dataset

Use this for **global/historical context**, not necessarily as the main live source.

OWID’s COVID dataset is very easy to use and available as CSV, XLSX, and JSON. Their documentation says it has one row per location and date and includes cases, deaths, hospitalizations, testing, vaccination, policy responses, reproduction rate, and other variables. ([docs.owid.io][8])

Data access:

```text
Our World in Data COVID CSV:
https://covid.ourworldindata.org/data/owid-covid-data.csv

Our World in Data COVID JSON:
https://covid.ourworldindata.org/data/owid-covid-data.json
```

However, OWID has changed its update strategy. Its “future updates” page says cases and deaths are sourced from WHO, checked daily, with the source updating weekly; some datasets are no longer updated. ([Our World in Data][9])

**Why it is useful:**

* Extremely convenient
* Global
* Great for historical curves
* Easy to train baseline models
* Good for comparing countries/regions

**Downside:**

* Some fields are no longer updated.
* U.S. local granularity is not the focus.
* For a current live dashboard, CDC sources are better.

Use OWID for the “big historical pandemic story,” not the core real-time model.

---

## 7. Illinois DPH COVID API

Illinois has a public API for statewide and county-level historical COVID data.

The statewide endpoint provides daily total case, testing, and death information for Illinois starting on **March 10, 2020**, including total tested, confirmed cases, deaths, daily changes, and 7-day rolling averages. ([Illinois Department of Public Health][10])

The county-level endpoint provides daily county snapshots over time, including cumulative cases, case changes, total tested, testing changes, deaths, and death changes. ([Illinois Department of Public Health][11])

Data access:

```text
Illinois statewide COVID time series:
https://idph.illinois.gov/DPHPublicInformation/api/COVIDExport/GetIllinoisCases

Cook County COVID time series:
https://idph.illinois.gov/DPHPublicInformation/api/COVIDExport/GetCountyTestResultsTimeSeries?CountyName=Cook
```

**Why it is useful:**

* Illinois-specific
* Easy JSON API
* Good historical data
* Could support a Chicago/Cook County narrative

**Downside:**

* I would verify freshness before relying on it as a live feed.
* Case/testing data is inherently less trustworthy now than wastewater.
* County-level data may not capture Chicago-specific dynamics cleanly.

Use it as a historical comparison layer.

---

# Data sources I would avoid as the primary source

## Chicago COVID datasets

Chicago’s COVID datasets are useful historically, but not ideal for a continuously updated project now.

The Chicago ZIP-code COVID dataset is marked **retired and historical-only**. ([Data.gov][12])

Chicago’s daily cases/deaths/hospitalizations dataset is also marked **historical-only**. ([Data.gov][13])

These are still valuable for historical visualizations, especially if you want to show how the pandemic moved through Chicago ZIP codes earlier in the pandemic, but they should not be the backbone of an auto-updating 2026 project.

---

# My recommended data stack

For the first serious version, I would build the dataset like this:

| Layer                     | Dataset                                 | Purpose                              |
| ------------------------- | --------------------------------------- | ------------------------------------ |
| Primary signal            | CDC NWSS SARS-CoV-2 wastewater          | Model current infection dynamics     |
| Local signal              | Illinois Wastewater Surveillance System | Chicago/Illinois-specific depth      |
| Severity validation       | CDC/NCHS COVID deaths                   | Lagging outcome                      |
| Severity validation       | CDC COVID-NET / RESP-NET                | Hospitalization trend validation     |
| Clinical testing context  | CDC NREVSS percent positivity           | Helps triangulate clinical signal    |
| Historical/global context | OWID COVID data                         | Big-picture comparison and narrative |
| Historical local context  | Chicago retired datasets                | Archive/history only                 |

---

# What the Neural ODE would actually model

The cleanest version would model a hidden state like:

[
z(t) =
\begin{bmatrix}
\text{infection pressure} \
\text{growth momentum} \
\text{severity pressure} \
\text{seasonal forcing}
\end{bmatrix}
]

Then the Neural ODE learns:

[
\frac{dz}{dt} = f_\theta(z(t), t, x(t))
]

Where:

* (z(t)) is the hidden pandemic state,
* (x(t)) could include wastewater, positivity, hospitalization, deaths, region, seasonality, and maybe variants,
* (f_\theta) is the neural network learning the dynamics,
* and the ODE solver rolls the system forward continuously.

The visual explanation becomes very powerful:

> “We observe scattered measurements — wastewater, hospitalizations, deaths — and the Neural ODE learns the continuous hidden motion that could have produced them.”

That is much more interesting than a normal time-series forecast.

---

# Best project concept

I would frame it as:

# **Pandemic Flow: A Neural ODE Visualization of COVID’s Hidden Dynamics**

The app could show:

1. **Observed wastewater signal**
2. **Learned continuous trajectory**
3. **Predicted next 1–4 weeks**
4. **Hospitalization/death lag overlay**
5. **Comparison between classical SIR and Neural ODE**
6. **Animated phase-space view**
7. **Map of U.S. wastewater sites or Illinois plants**
8. **“What changed?” interpretation panel**

The most educational version would show three models side by side:

| Model                      | Meaning                             |
| -------------------------- | ----------------------------------- |
| SIR model                  | Hand-written differential equations |
| Neural ODE                 | Learned differential equations      |
| Baseline time-series model | Normal forecasting comparison       |

That way, users see why Neural ODEs matter.

---

# My final recommendation

Build the first prototype using:

1. **CDC NWSS SARS-CoV-2 wastewater**
2. **CDC/NCHS COVID deaths**
3. **CDC NREVSS percent positivity**
4. **OWID for historical/global context**

Then add Illinois IWSS once the basic model and visualization work.

The reason is simple: CDC NWSS gives you the best combination of **current relevance, free access, update cadence, public credibility, and model suitability**. It also aligns beautifully with the Neural ODE concept because wastewater is not merely “a number”; it is a noisy biological trace of a hidden dynamic system.

[1]: https://catalog.data.gov/dataset/cdc-wastewater-data-for-sars-cov-2?utm_source=chatgpt.com "U.S. Department of Health & Human Services - CDC Wastewater Data for SARS-CoV-2"
[2]: https://www.cdc.gov/wastewater/about-data/index.html "About Wastewater Data | Wastewater Monitoring | CDC"
[3]: https://iwss.uillinois.edu/about/data-readme/ "About the data | IWSS Dashboard"
[4]: https://catalog.data.gov/dataset/provisional-covid-19-death-counts-by-week-ending-date-and-state?utm_source=chatgpt.com "U.S. Department of Health & Human Services - Provisional COVID-19 Death Counts by Week Ending Date and State"
[5]: https://www.cdc.gov/resp-net/dashboard/index.html?utm_source=chatgpt.com "Respiratory Virus Hospitalization Surveillance Network (RESP-NET) | RESP-NET | CDC"
[6]: https://www.cdc.gov/covid/php/covid-net/index.html?utm_source=chatgpt.com "Coronavirus Disease 2019 (COVID-19) Hospitalization Surveillance Network (COVID-NET) | Covid | CDC"
[7]: https://www.cdc.gov/respiratory-viruses/data/activity-levels.html?utm_source=chatgpt.com "Respiratory Virus Activity Levels | Respiratory Illnesses | CDC"
[8]: https://docs.owid.io/projects/covid/en/latest/dataset.html "Data on COVID-19 (coronavirus) by Our World in Data - COVID-19 dataset by Our World in Data 0.0.1.dev0 documentation"
[9]: https://ourworldindata.org/future-updates-data-covid "Future updates of our data on COVID-19 - Our World in Data"
[10]: https://idph.illinois.gov/DPHPublicInformation/Help/Api/GET-api-COVIDExport-GetIllinoisCases "GET api/COVIDExport/GetIllinoisCases"
[11]: https://idph.illinois.gov/DPHPublicInformation/Help/Api/GET-api-COVIDExport-GetCountyTestResultsTimeSeries_CountyName "GET api/COVIDExport/GetCountyTestResultsTimeSeries?CountyName={CountyName}"
[12]: https://catalog.data.gov/dataset/covid-19-cases-tests-and-deaths-by-zip-code "COVID-19 Cases, Tests, and Deaths by ZIP Code - Historical - Catalog"
[13]: https://catalog.data.gov/dataset/covid-19-daily-cases-deaths-and-hospitalizations?utm_source=chatgpt.com "COVID-19 Daily Cases, Deaths, and Hospitalizations - Historical - Catalog"
