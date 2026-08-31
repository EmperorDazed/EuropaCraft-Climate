/* ==========================================================
   EuropaCraft Weather Engine v2

   KEEP THIS FILE NAME:
   europacraft-weather-v1.js

   This replaces the old weather engine without requiring
   any index.html changes.

   SYSTEM:

   climate geography
        ↓
   seasonal climatology
        ↓
   pressure field
        ↓
   wind
        ↓
   air-mass advection
        ↓
   moisture
        ↓
   clouds
        ↓
   fronts / lift / precipitation
        ↓
   snow / sleet / rain

   Minecraft precipitation phase:

   <= 1.5 C       SNOW
   >1.5 to 3.0 C  SLEET
   >3.0 C         RAIN
========================================================== */

(function (global) {

"use strict";


const DEG =
    Math.PI /
    180;


const RAD =
    Math.PI /
    180;



/* ==========================================================
   BASIC HELPERS
========================================================== */


function clamp(
    value,
    minimum,
    maximum
) {

    return Math.max(
        minimum,
        Math.min(
            maximum,
            value
        )
    );

}


function lerp(
    a,
    b,
    amount
) {

    return (
        a +
        (
            b -
            a
        ) *
        amount
    );

}


function dayNumber(
    date
) {

    const d =
        date instanceof Date
            ? date
            : new Date(date);


    return (
        d.getTime() /
        86400000
    );

}


function dayOfYear(
    date
) {

    const d =
        date instanceof Date
            ? date
            : new Date(date);


    const start =
        Date.UTC(
            d.getUTCFullYear(),
            0,
            0
        );


    const now =
        Date.UTC(
            d.getUTCFullYear(),
            d.getUTCMonth(),
            d.getUTCDate()
        );


    return Math.floor(
        (
            now -
            start
        ) /
        86400000
    );

}



/* ==========================================================
   PRESSURE FIELD

   This produces actual moving synoptic-scale patterns
   rather than a simple latitude gradient.
========================================================== */


function pressure(
    latitude,
    longitude,
    date
) {

    const t =
        dayNumber(
            date
        );


    /*
     * Planetary-scale background wave.
     */

    const wave1 =

        7.5 *

        Math.sin(

            (
                longitude *
                1.35 +

                t *
                11.5 +

                latitude *
                0.25
            ) *

            DEG

        );


    /*
     * Secondary travelling wave.
     */

    const wave2 =

        5.0 *

        Math.cos(

            (
                longitude *
                2.0 -

                t *
                7.0 +

                latitude *
                0.75
            ) *

            DEG

        );


    /*
     * Smaller-scale synoptic wave.
     */

    const wave3 =

        3.2 *

        Math.sin(

            (
                longitude *
                3.4 +

                latitude *
                1.3 +

                t *
                15
            ) *

            DEG

        );


    /*
     * North Atlantic storm-track background.
     */

    const atlanticStormTrack =

        -5.5 *

        Math.exp(

            -(

                (
                    (
                        latitude -
                        57
                    ) /
                    11
                ) ** 2

                +

                (
                    (
                        longitude +
                        12
                    ) /
                    24
                ) ** 2

            )

        );


    /*
     * Azores / subtropical high tendency.
     */

    const subtropicalHigh =

        5.0 *

        Math.exp(

            -(

                (
                    (
                        latitude -
                        35
                    ) /
                    9
                ) ** 2

                +

                (
                    (
                        longitude +
                        9
                    ) /
                    25
                ) ** 2

            )

        );


    /*
     * Continental pressure wave.

     * This helps Europe develop different pressure
     * behaviour from the Atlantic.
     */

    const continentalWave =

        3.0 *

        Math.cos(

            (
                longitude *
                1.45 -

                latitude *
                0.55 +

                t *
                3.5
            ) *

            DEG

        );


    return (

        1014.5 +

        wave1 +

        wave2 +

        wave3 +

        atlanticStormTrack +

        subtropicalHigh +

        continentalWave

    );

}



/* ==========================================================
   PRESSURE GRADIENT
========================================================== */


function pressureGradient(
    latitude,
    longitude,
    date
) {

    const step =
        0.30;


    const north =
        pressure(
            latitude +
            step,
            longitude,
            date
        );


    const south =
        pressure(
            latitude -
            step,
            longitude,
            date
        );


    const east =
        pressure(
            latitude,
            longitude +
            step,
            date
        );


    const west =
        pressure(
            latitude,
            longitude -
            step,
            date
        );


    const northSouth =

        (
            north -
            south
        ) /

        (
            step *
            2
        );


    const eastWest =

        (
            east -
            west
        ) /

        (
            step *
            2
        );


    return {

        northSouth:
            northSouth,

        eastWest:
            eastWest,

        magnitude:
            Math.hypot(
                northSouth,
                eastWest
            )

    };

}



/* ==========================================================
   WIND
========================================================== */


function windAt(
    latitude,
    longitude,
    date
) {

    const gradient =
        pressureGradient(
            latitude,
            longitude,
            date
        );


    /*
     * Northern Hemisphere approximation.

     * Wind runs broadly parallel to isobars rather
     * than directly from high toward low.
     */

    let u =

        -gradient.northSouth *
        2.30;


    let v =

        gradient.eastWest *
        2.30;


    /*
     * Latitude correction.

     * Coriolis is weaker toward southern edge.
     */

    const latitudeFactor =
        clamp(
            (
                latitude -
                25
            ) /
            35,
            0.35,
            1
        );


    u *=
        latitudeFactor;


    v *=
        latitudeFactor;


    /*
     * Surface friction.
     */

    u *=
        0.82;


    v *=
        0.82;


    let speed =
        Math.hypot(
            u,
            v
        );


    /*
     * Limit pathological prototype values.
     */

    if (
        speed >
        35
    ) {

        const scale =
            35 /
            speed;


        u *=
            scale;


        v *=
            scale;


        speed =
            35;

    }


    /*
     * Meteorological FROM direction.
     */

    const direction =

        (
            Math.atan2(
                -u,
                -v
            ) /
            DEG +

            360
        ) %

        360;


    return {

        uMs:
            u,

        vMs:
            v,

        speedMs:
            speed,

        directionDeg:
            direction

    };

}



/* ==========================================================
   SOLAR GEOMETRY
========================================================== */


function solarInformation(
    latitude,
    longitude,
    date
) {

    const d =
        date instanceof Date
            ? date
            : new Date(date);


    const doy =
        dayOfYear(
            d
        );


    /*
     * Approximate solar declination.
     */

    const declination =

        23.44 *

        Math.sin(

            (
                360 /
                365 *

                (
                    doy -
                    81
                )
            ) *

            DEG

        );


    const latitudeRadians =
        latitude *
        RAD;


    const declinationRadians =
        declination *
        RAD;


    let cosHourAngle =

        -Math.tan(
            latitudeRadians
        ) *

        Math.tan(
            declinationRadians
        );


    cosHourAngle =
        clamp(
            cosHourAngle,
            -1,
            1
        );


    const hourAngle =
        Math.acos(
            cosHourAngle
        );


    const dayLength =

        24 /

        Math.PI *

        hourAngle;


    /*
     * Approximate local solar hour.

     * Longitude is enough for our game map.
     */

    let localHour =

        d.getUTCHours() +

        d.getUTCMinutes() /
        60 +

        longitude /
        15;


    localHour =

        (
            localHour %
            24 +

            24
        ) %

        24;


    const sunrise =

        12 -
        dayLength /
        2;


    const sunset =

        12 +
        dayLength /
        2;


    return {

        localHour:
            localHour,

        sunrise:
            sunrise,

        sunset:
            sunset,

        dayLength:
            dayLength,

        declination:
            declination

    };

}



/* ==========================================================
   EUROPEAN CLIMATOLOGICAL TEMPERATURE

   THIS REPLACES THE OLD BROKEN LATITUDE-DOMINATED
   TEMPERATURE CALCULATION.
========================================================== */


function climatologicalTemperature(
    latitude,
    longitude,
    date,
    climate,
    landFraction
) {

    const doy =
        dayOfYear(
            date
        );


    const n =
        climate.normalized;


    const maritime =
        climate.indices.maritime;


    const continental =
        climate.indices.continental;


    const warmSource =
        climate.indices.warmSource;


    const coldSource =
        climate.indices.coldSource;


    /*
     * Broad annual mean.

     * Examples this is designed to permit:

     * Britain ~10-11 C annual mean
     * Mediterranean Europe ~15-18 C
     * western Russia ~5-8 C
     * northern Scandinavia much colder
     */

    let annualMean =

        16.1 -

        0.335 *

        Math.max(
            0,
            latitude -
            35
        );


    /*
     * Far eastern continental Europe gets somewhat
     * colder annual mean.
     */

    annualMean -=

        0.030 *

        Math.max(
            0,
            longitude -
            15
        );


    /*
     * Warm Mediterranean / North African contribution.
     */

    annualMean +=

        2.6 *
        warmSource;


    /*
     * Arctic / Scandinavian contribution.
     */

    annualMean -=

        2.0 *
        coldSource;


    /*
     * Seasonal amplitude.

     * This is the critical part missing from the old model.

     * Atlantic locations have small annual range.
     * Continental interiors have large annual range.
     */

    let annualAmplitude =

        3.8 +

        0.16 *

        Math.max(
            0,
            latitude -
            35
        ) +

        7.5 *
        continental -

        4.7 *
        maritime;


    annualAmplitude =
        clamp(
            annualAmplitude,
            4.2,
            17
        );


    /*
     * Seasonal cycle peaks around late July.
     */

    const seasonal =

        annualAmplitude *

        Math.cos(

            2 *

            Math.PI *

            (
                doy -
                205
            ) /

            365.2422

        );


    /*
     * Mediterranean / North African summer enhancement.

     * Prevents Mediterranean summers being too weak.
     */

    const summerFactor =

        Math.max(

            0,

            Math.cos(

                2 *

                Math.PI *

                (
                    doy -
                    205
                ) /

                365.2422

            )

        );


    const summerWarmth =

        2.7 *

        warmSource *

        summerFactor;


    /*
     * Continental winter penalty.

     * Gives Poland / Belarus / Russia genuinely colder
     * winters than Atlantic Europe at equal latitude.
     */

    const winterFactor =

        Math.max(

            0,

            -Math.cos(

                2 *

                Math.PI *

                (
                    doy -
                    205
                ) /

                365.2422

            )

        );


    const continentalWinter =

        -4.0 *

        continental *

        winterFactor;


    /*
     * Atlantic winter moderation.

     * Particularly important for UK, Ireland, western France,
     * western Norway etc.
     */

    const atlanticWinter =

        3.3 *

        maritime *

        winterFactor;


    /*
     * Ocean / land surface modification.
     */

    const waterFraction =
        1 -
        landFraction;


    const oceanAdjustment =

        waterFraction *

        (
            winterFactor *
            2.5

            -

            summerFactor *
            1.7
        );


    return (

        annualMean +

        seasonal +

        summerWarmth +

        continentalWinter +

        atlanticWinter +

        oceanAdjustment

    );

}



/* ==========================================================
   NATURAL DIURNAL RANGE
========================================================== */


function naturalDiurnalRange(
    climate,
    landFraction
) {

    const maritime =
        climate.indices.maritime;


    const continental =
        climate.indices.continental;


    /*
     * Ocean:
     * tiny daily range.

     * Land:
     * larger range.

     * Continental land:
     * largest range.
     */

    let range =

        3.0 +

        5.5 *
        landFraction +

        4.0 *
        continental -

        3.0 *
        maritime;


    return clamp(
        range,
        2.0,
        13.5
    );

}



/* ==========================================================
   DIURNAL TEMPERATURE OFFSET
========================================================== */


function diurnalTemperatureOffset(
    latitude,
    longitude,
    date,
    range,
    cloudFraction
) {

    const solar =
        solarInformation(
            latitude,
            longitude,
            date
        );


    const hour =
        solar.localHour;


    /*
     * Cloud strongly suppresses daytime heating
     * and slightly suppresses overnight cooling.
     */

    const cloudSuppression =

        1 -

        0.72 *
        cloudFraction;


    const effectiveRange =

        range *

        clamp(
            cloudSuppression,
            0.18,
            1
        );


    /*
     * Maximum around 14:30 local solar time.
     *
     * Minimum near sunrise.
     */

    const phase =

        (
            hour -
            14.5
        ) /

        24 *

        2 *

        Math.PI;


    const cycle =
        Math.cos(
            phase
        );


    /*
     * Centre around daily mean.
     */

    return (

        cycle *

        effectiveRange /
        2

    );

}



/* ==========================================================
   UPWIND CLIMATE

   Gives a crude first form of air-mass trajectory.

   Later we can replace this with actual persistent
   cell-to-cell transport.
========================================================== */


function upstreamClimate(
    latitude,
    longitude,
    wind,
    options
) {

    if (
        wind.speedMs <
        0.5
    ) {

        return null;

    }


    /*
     * Convert direction of movement into degrees.

     * u positive = eastward
     * v positive = northward.
     */

    const distanceDegrees =

        clamp(
            wind.speedMs /
            4,
            1.0,
            5.0
        );


    const latitudeOffset =

        -wind.vMs /
        Math.max(
            1,
            wind.speedMs
        ) *

        distanceDegrees;


    const longitudeOffset =

        -wind.uMs /
        Math.max(
            1,
            wind.speedMs
        ) *

        distanceDegrees;


    const upstreamLatitude =

        clamp(
            latitude +
            latitudeOffset,
            30,
            74
        );


    const upstreamLongitude =

        clamp(
            longitude +
            longitudeOffset,
            -26,
            52
        );


    /*
     * Unknown exact upstream land fraction.

     * 0.5 allows the climate geography to remain the
     * main determinant rather than forcing land/ocean.
     */

    return global.EuropaClimate.getIndices(

        upstreamLatitude,

        upstreamLongitude,

        {
            landFraction:
                0.5
        }

    );

}



/* ==========================================================
   MOISTURE FIELD

   This is now the main requirement for precipitation.
========================================================== */


function moistureField(
    latitude,
    longitude,
    date,
    climate,
    upstream,
    wind,
    temperature
) {

    const t =
        dayNumber(
            date
        );


    const n =
        climate.normalized;


    /*
     * Local maritime moisture supply.
     */

    let maritimeSupply =

        (

            n["Atlantic"] +

            n["Polar Maritime"] +

            n["North Sea"] +

            n["Baltic Maritime"] +

            n["Mediterranean"] +

            n["Black Sea"] +

            n["Caspian Maritime"]

        ) /

        100;


    maritimeSupply =
        clamp(
            maritimeSupply,
            0,
            1
        );


    /*
     * Upwind moisture.

     * Moist air travelling from Atlantic / North Sea /
     * Mediterranean has more precipitation potential.
     */

    let upstreamMaritime =
        maritimeSupply;


    if (
        upstream
    ) {

        upstreamMaritime =
            upstream.indices.maritime;

    }


    /*
     * Warmer air can contain more water vapour.
     */

    const temperatureCapacity =

        clamp(

            (
                temperature +
                15
            ) /
            35,

            0.12,
            1

        );


    /*
     * Synoptic moisture waves make the moisture field
     * non-uniform.

     * This is deliberately smooth rather than random noise.
     */

    const moistureWave1 =

        0.5 +

        0.5 *

        Math.sin(

            (
                longitude *
                4.1 +

                latitude *
                1.7 +

                t *
                19
            ) *

            DEG

        );


    const moistureWave2 =

        0.5 +

        0.5 *

        Math.sin(

            (
                longitude *
                1.8 -

                latitude *
                2.4 +

                t *
                11
            ) *

            DEG

        );


    const synopticVariation =

        0.65 +

        0.22 *
        moistureWave1 +

        0.13 *
        moistureWave2;


    /*
     * Wind imports moisture more effectively.
     */

    const transportFactor =

        clamp(

            wind.speedMs /
            12,

            0.15,
            1

        );


    let moisture =

        0.12 +

        0.38 *
        maritimeSupply +

        0.34 *
        upstreamMaritime *
        transportFactor +

        0.16 *
        temperatureCapacity;


    moisture *=
        synopticVariation;


    /*
     * Very continental interiors are generally drier.
     */

    moisture -=

        0.16 *

        climate.indices.continental;


    return clamp(
        moisture,
        0.03,
        1
    );

}



/* ==========================================================
   FRONTAL BAND

   Creates narrow curved precipitation areas instead
   of half a continent precipitating uniformly.
========================================================== */


function frontalBand(
    latitude,
    longitude,
    date
) {

    const t =
        dayNumber(
            date
        );


    const wave =

        Math.sin(

            (
                longitude *
                2.5 +

                latitude *
                1.10 +

                t *
                12
            ) *

            DEG

        )

        +

        0.55 *

        Math.sin(

            (
                longitude *
                0.85 -

                latitude *
                1.55 +

                t *
                5.5
            ) *

            DEG

        );


    /*
     * High value only near the zero-crossing:
     * narrow frontal ribbon.
     */

    return Math.exp(

        -(

            wave /
            0.32

        ) ** 2

    );

}



/* ==========================================================
   SHOWER PATCHINESS

   Keeps unstable air from raining everywhere continuously.
========================================================== */


function showerPatch(
    latitude,
    longitude,
    date
) {

    const t =
        dayNumber(
            date
        );


    const a =

        0.5 +

        0.5 *

        Math.sin(

            (
                longitude *
                9.0 +

                latitude *
                5.0 +

                t *
                43
            ) *

            DEG

        );


    const b =

        0.5 +

        0.5 *

        Math.sin(

            (
                longitude *
                6.0 -

                latitude *
                7.5 +

                t *
                31
            ) *

            DEG

        );


    return (
        a *
        b
    );

}



/* ==========================================================
   CLOUD FIELD
========================================================== */


function cloudField(
    pressureValue,
    moisture,
    gradient,
    front,
    showers
) {

    /*
     * Low pressure promotes ascent.
     */

    const lowPressureLift =

        clamp(

            (
                1017 -
                pressureValue
            ) /
            20,

            0,
            1

        );


    /*
     * Strong pressure gradient supports synoptic activity.
     */

    const gradientLift =

        clamp(

            gradient.magnitude /
            12,

            0,
            1

        );


    let cloud =

        0.08 +

        0.52 *
        moisture +

        0.28 *
        lowPressureLift +

        0.22 *
        front +

        0.08 *
        gradientLift +

        0.08 *
        showers;


    return clamp(
        cloud,
        0.02,
        1
    );

}



/* ==========================================================
   AIR-MASS TEMPERATURE ADVECTION
========================================================== */


function advectionTemperature(
    latitude,
    longitude,
    date,
    localClimate,
    upstream,
    wind,
    localBaseline
) {

    let correction =
        0;


    /*
     * Direct north/south component.
     */

    const meridional =

        wind.vMs;


    correction +=

        meridional *
        0.18;


    /*
     * Compare upstream climatology with local climatology.

     * This is what lets easterlies/westerlies begin to
     * transport different air rather than merely changing
     * the wind arrow.
     */

    if (
        upstream
    ) {

        const upstreamBaseline =

            climatologicalTemperature(

                upstream.lat,

                upstream.lon,

                date,

                upstream,

                0.5

            );


        const difference =

            upstreamBaseline -
            localBaseline;


        const transportStrength =

            clamp(

                wind.speedMs /
                14,

                0,
                0.80

            );


        correction +=

            difference *
            transportStrength;

    }


    /*
     * Prevent an immature prototype from producing
     * physically absurd 20 C advection jumps.
     */

    return clamp(
        correction,
        -10,
        10
    );

}



/* ==========================================================
   PRECIPITATION
========================================================== */


function precipitationField(
    pressureValue,
    moisture,
    cloud,
    gradient,
    front,
    showers
) {

    const lowLift =

        clamp(

            (
                1016 -
                pressureValue
            ) /
            18,

            0,
            1

        );


    const gradientLift =

        clamp(

            gradient.magnitude /
            11,

            0,
            1

        );


    /*
     * Two precipitation mechanisms:

     * 1. frontal
     * 2. showers / unstable low pressure

     * BOTH require moisture.
     */

    const frontalPotential =

        moisture *

        front *

        (
            0.55 +
            0.45 *
            gradientLift
        );


    const showerPotential =

        moisture *

        showers *

        lowLift *

        0.80;


    let potential =

        Math.max(
            frontalPotential,
            showerPotential
        );


    /*
     * Thick cloud helps but cannot create precipitation
     * by itself.
     */

    potential *=

        0.65 +

        0.35 *
        cloud;


    /*
     * Dry air simply cannot precipitate substantially.
     */

    if (
        moisture <
        0.30
    ) {

        potential *=
            0.25;

    }


    const chance =
        clamp(

            (
                potential -
                0.18
            ) /
            0.58,

            0,
            1

        );


    /*
     * Actual precipitation threshold.

     * This creates large dry gaps.
     */

    const precipitating =

        potential >
        0.34;


    /*
     * Relative intensity.
     */

    const intensity =

        precipitating

            ? clamp(

                (
                    potential -
                    0.34
                ) /
                0.50,

                0.05,
                1

            )

            : 0;


    return {

        potential:
            potential,

        chance:
            chance,

        precipitating:
            precipitating,

        intensity:
            intensity

    };

}



/* ==========================================================
   PRECIPITATION PHASE

   USER-SELECTED MINECRAFT RULE:

   <= 1.5 C       snow
   1.5 - 3.0 C    sleet
   > 3.0 C        rain
========================================================== */


function precipitationType(
    temperature,
    precipitating
) {

    if (
        !precipitating
    ) {

        return "dry";

    }


    if (
        temperature <=
        1.5
    ) {

        return "snow";

    }


    if (
        temperature <=
        3.0
    ) {

        return "sleet";

    }


    return "rain";

}



/* ==========================================================
   MAIN WEATHER SIMULATION
========================================================== */


function simulate(
    latitude,
    longitude,
    date = new Date(),
    options = {}
) {

    if (
        !global.EuropaClimate
    ) {

        throw new Error(
            "EuropaClimate must be loaded before EuropaWeather."
        );

    }


    latitude =
        Number(
            latitude
        );


    longitude =
        Number(
            longitude
        );


    const d =
        date instanceof Date
            ? date
            : new Date(date);


    const landFraction =

        Number.isFinite(
            options.landFraction
        )

            ? clamp(
                options.landFraction,
                0,
                1
            )

            : 0.5;


    const climate =

        global.EuropaClimate.getIndices(

            latitude,

            longitude,

            {
                landFraction:
                    landFraction
            }

        );


    const wind =

        windAt(
            latitude,
            longitude,
            d
        );


    const pressureValue =

        pressure(
            latitude,
            longitude,
            d
        );


    const gradient =

        pressureGradient(
            latitude,
            longitude,
            d
        );


    const upstream =

        upstreamClimate(
            latitude,
            longitude,
            wind,
            options
        );


    /*
     * Local daily mean climatology.
     */

    const baseline =

        climatologicalTemperature(

            latitude,
            longitude,
            d,
            climate,
            landFraction

        );


    /*
     * Synoptic air-mass temperature modification.
     */

    const advection =

        advectionTemperature(

            latitude,
            longitude,
            d,
            climate,
            upstream,
            wind,
            baseline

        );


    /*
     * Preliminary temperature before cloud / daily cycle.
     */

    const preliminaryTemperature =

        baseline +
        advection;


    /*
     * Moisture before clouds.
     */

    const moisture =

        moistureField(

            latitude,
            longitude,
            d,
            climate,
            upstream,
            wind,
            preliminaryTemperature

        );


    const front =

        frontalBand(
            latitude,
            longitude,
            d
        );


    const showers =

        showerPatch(
            latitude,
            longitude,
            d
        );


    const cloudFraction =

        cloudField(

            pressureValue,
            moisture,
            gradient,
            front,
            showers

        );


    /*
     * Actual hour-of-day temperature.
     */

    const normalRange =

        naturalDiurnalRange(
            climate,
            landFraction
        );


    const diurnal =

        diurnalTemperatureOffset(

            latitude,
            longitude,
            d,
            normalRange,
            cloudFraction

        );


    /*
     * Low pressure air is weakly cooler;
     * high pressure weakly warmer.
     */

    const pressureTemperature =

        (
            pressureValue -
            1014.5
        ) *
        0.045;


    const temperature =

        preliminaryTemperature +

        diurnal +

        pressureTemperature;


    /*
     * Relative humidity.

     * Moisture is now the primary driver.
     */

    let humidity =

        32 +

        moisture *
        64;


    /*
     * Cooler air reaches saturation more easily.
     */

    humidity +=

        clamp(
            (
                10 -
                temperature
            ) *
            0.8,
            -8,
            12
        );


    humidity =
        clamp(
            humidity,
            20,
            100
        );


    const precip =

        precipitationField(

            pressureValue,
            moisture,
            cloudFraction,
            gradient,
            front,
            showers

        );


    const precipType =

        precipitationType(

            temperature,

            precip.precipitating

        );


    return {

        date:
            d.toISOString(),

        lat:
            latitude,

        lon:
            longitude,


        climate:
            climate,


        pressureHpa:
            pressureValue,


        pressureGradient:
            gradient.magnitude,


        wind:
            wind,


        baselineTemperatureC:
            baseline,


        advectionTemperatureC:
            advection,


        diurnalTemperatureC:
            diurnal,


        temperatureC:
            temperature,


        moisture:
            moisture,


        humidityPct:
            humidity,


        cloudFraction:
            cloudFraction,


        frontalStrength:
            front,


        showerStrength:
            showers,


        precipitationPotential:
            precip.potential,


        precipitationChance:
            precip.chance,


        precipitationIntensity:
            precip.intensity,


        precipitationType:
            precipType

    };

}



/* ==========================================================
   PUBLIC API
========================================================== */


global.EuropaWeather =
    Object.freeze({

        version:
            "2.0-moisture",

        pressure:
            pressure,

        pressureGradient:
            pressureGradient,

        windAt:
            windAt,

        simulate:
            simulate

    });


})(window);
