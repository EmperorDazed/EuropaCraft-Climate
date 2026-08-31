(function (global) {
"use strict";

const DEG = Math.PI / 180;

function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

function asDate(date) {
    const d =
        date instanceof Date
            ? date
            : new Date(date);

    return Number.isNaN(d.getTime())
        ? new Date()
        : d;
}

function dayNumber(date) {
    return (
        asDate(date).getTime() /
        86400000
    );
}

function dayOfYear(date) {
    const d =
        asDate(date);

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
   PRESSURE
========================================================== */

function pressure(
    latitude,
    longitude,
    date
) {

    const t =
        dayNumber(date);

    const wave1 =
        7.2 *
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

    const wave2 =
        4.8 *
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

    const wave3 =
        2.8 *
        Math.sin(
            (
                longitude *
                3.4 +
                latitude *
                1.3 +
                t *
                15.0
            ) *
            DEG
        );

    const dyAtlantic =
        (
            latitude -
            57
        ) /
        11;

    const dxAtlantic =
        (
            longitude +
            12
        ) /
        24;

    const atlanticLow =
        -5.5 *
        Math.exp(
            -(
                dyAtlantic *
                dyAtlantic +
                dxAtlantic *
                dxAtlantic
            )
        );

    const dyHigh =
        (
            latitude -
            35
        ) /
        9;

    const dxHigh =
        (
            longitude +
            9
        ) /
        25;

    const subtropicalHigh =
        5.0 *
        Math.exp(
            -(
                dyHigh *
                dyHigh +
                dxHigh *
                dxHigh
            )
        );

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
        atlanticLow +
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
            2 *
            step
        );

    const eastWest =
        (
            east -
            west
        ) /
        (
            2 *
            step
        );

    return {
        northSouth,
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

    const coriolis =
        clamp(
            (
                latitude -
                25
            ) /
            35,
            0.35,
            1.0
        );

    let u =
        -gradient.northSouth *
        2.3 *
        coriolis *
        0.82;

    let v =
        gradient.eastWest *
        2.3 *
        coriolis *
        0.82;

    let speed =
        Math.hypot(
            u,
            v
        );

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
   SOLAR INFORMATION
========================================================== */

function solarInfo(
    latitude,
    longitude,
    date
) {

    const d =
        asDate(date);

    const doy =
        dayOfYear(d);

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
        DEG;

    const declinationRadians =
        declination *
        DEG;

    const cosHourAngle =
        clamp(
            -Math.tan(
                latitudeRadians
            ) *
            Math.tan(
                declinationRadians
            ),
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

    let localHour =
        d.getUTCHours() +
        d.getUTCMinutes() /
        60 +
        longitude /
        15;

    localHour =
        (
            (
                localHour %
                24
            ) +
            24
        ) %
        24;

    return {
        localHour,
        dayLength,
        sunrise:
            12 -
            dayLength /
            2,
        sunset:
            12 +
            dayLength /
            2
    };
}


/* ==========================================================
   CLIMATOLOGICAL MEAN TEMPERATURE
========================================================== */

function climatologicalMean(
    latitude,
    longitude,
    date,
    climate,
    landFraction
) {

    const doy =
        dayOfYear(date);

    const maritime =
        climate.indices.maritime;

    const continental =
        climate.indices.continental;

    const warmSource =
        climate.indices.warmSource;

    const coldSource =
        climate.indices.coldSource;

    let annualMean =
        16.2 -
        0.30 *
        Math.max(
            0,
            latitude -
            35
        ) -
        0.025 *
        Math.max(
            0,
            longitude -
            15
        );

    annualMean +=
        2.4 *
        warmSource;

    annualMean -=
        1.5 *
        coldSource;

    let amplitude =
        5.0 +
        0.14 *
        Math.max(
            0,
            latitude -
            35
        ) +
        8.5 *
        continental -
        5.5 *
        maritime;

    amplitude =
        clamp(
            amplitude,
            4.5,
            18.0
        );

    const seasonalCos =
        Math.cos(
            2 *
            Math.PI *
            (
                doy -
                205
            ) /
            365.2422
        );

    const summer =
        Math.max(
            0,
            seasonalCos
        );

    const winter =
        Math.max(
            0,
            -seasonalCos
        );

    let mean =
        annualMean +
        amplitude *
        seasonalCos;

    mean +=
        2.2 *
        warmSource *
        summer;

    mean -=
        4.8 *
        continental *
        winter;

    mean +=
        4.2 *
        maritime *
        winter;

    mean +=
        (
            1 -
            landFraction
        ) *
        (
            2.0 *
            winter -
            1.5 *
            summer
        );

    return mean;
}


/* ==========================================================
   DIURNAL RANGE
========================================================== */

function naturalDiurnalRange(
    climate,
    landFraction
) {

    return clamp(
        3.0 +
        7.0 *
        landFraction +
        4.0 *
        climate.indices.continental -
        3.5 *
        climate.indices.maritime,
        1.5,
        14.0
    );
}


/* ==========================================================
   DIURNAL TEMPERATURE
========================================================== */

function diurnalOffset(
    latitude,
    longitude,
    date,
    range,
    cloudFraction
) {

    const solar =
        solarInfo(
            latitude,
            longitude,
            date
        );

    const cloudFactor =
        clamp(
            1 -
            0.72 *
            cloudFraction,
            0.20,
            1.0
        );

    const effectiveRange =
        range *
        cloudFactor;

    const phase =
        (
            solar.localHour -
            14.5
        ) /
        24 *
        2 *
        Math.PI;

    return (
        Math.cos(
            phase
        ) *
        effectiveRange /
        2
    );
}


/* ==========================================================
   UPSTREAM POSITION
========================================================== */

function upstream(
    latitude,
    longitude,
    wind
) {

    if (
        wind.speedMs <
        0.5
    ) {

        return {
            lat:
                latitude,
            lon:
                longitude
        };
    }

    const distance =
        clamp(
            wind.speedMs /
            4,
            1,
            5
        );

    return {
        lat:
            clamp(
                latitude -
                (
                    wind.vMs /
                    wind.speedMs
                ) *
                distance,
                30,
                74
            ),

        lon:
            clamp(
                longitude -
                (
                    wind.uMs /
                    wind.speedMs
                ) *
                distance,
                -26,
                52
            )
    };
}


/* ==========================================================
   MOISTURE FIELD
========================================================== */

function moistureField(
    latitude,
    longitude,
    date,
    climate,
    upstreamClimate,
    wind,
    temperature,
    landFraction
) {

    const t =
        dayNumber(date);

    const localMaritime =
        climate.indices.maritime;

    const upstreamMaritime =
        upstreamClimate
            ? upstreamClimate.indices.maritime
            : localMaritime;

    const warmthCapacity =
        clamp(
            (
                temperature +
                15
            ) /
            35,
            0.10,
            1.0
        );

    const waveA =
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

    const waveB =
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

    const texture =
        0.55 +
        0.27 *
        waveA +
        0.18 *
        waveB;

    const transport =
        clamp(
            wind.speedMs /
            12,
            0.15,
            1.0
        );

    const seaPickup =
        (
            1 -
            landFraction
        ) *
        clamp(
            (
                temperature +
                5
            ) /
            25,
            0.15,
            1.0
        ) *
        0.18;

    let moisture =
        0.10 +
        0.34 *
        localMaritime +
        0.32 *
        upstreamMaritime *
        transport +
        0.13 *
        warmthCapacity +
        seaPickup;

    moisture *=
        texture;

    moisture -=
        0.12 *
        climate.indices.continental;

    return clamp(
        moisture,
        0.03,
        1.0
    );
}


/* ==========================================================
   FRONTAL BAND
========================================================== */

function frontalBand(
    latitude,
    longitude,
    date
) {

    const t =
        dayNumber(date);

    const wave =
        Math.sin(
            (
                longitude *
                2.5 +
                latitude *
                1.1 +
                t *
                12
            ) *
            DEG
        ) +
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

    const q =
        wave /
        0.32;

    return Math.exp(
        -(
            q *
            q
        )
    );
}


/* ==========================================================
   SHOWER PATCHINESS
========================================================== */

function showerPatch(
    latitude,
    longitude,
    date
) {

    const t =
        dayNumber(date);

    const a =
        0.5 +
        0.5 *
        Math.sin(
            (
                longitude *
                9 +
                latitude *
                5 +
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
                6 -
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
   CLOUD
========================================================== */

function cloudField(
    pressureValue,
    moisture,
    gradient,
    front,
    showers
) {

    const lowLift =
        clamp(
            (
                1017 -
                pressureValue
            ) /
            20,
            0,
            1
        );

    const gradientLift =
        clamp(
            gradient.magnitude /
            12,
            0,
            1
        );

    return clamp(
        0.06 +
        0.48 *
        moisture +
        0.22 *
        lowLift +
        0.28 *
        front +
        0.08 *
        gradientLift +
        0.06 *
        showers,
        0.02,
        1.0
    );
}


/* ==========================================================
   ADVECTION
========================================================== */

function advectionCorrection(
    latitude,
    longitude,
    date,
    localClimate,
    upstreamClimate,
    wind,
    localMean
) {

    let correction =
        wind.vMs *
        0.16;

    if (
        upstreamClimate
    ) {

        const upstreamPoint =
            upstream(
                latitude,
                longitude,
                wind
            );

        const upstreamMean =
            climatologicalMean(
                upstreamPoint.lat,
                upstreamPoint.lon,
                date,
                upstreamClimate,
                0.5
            );

        const strength =
            clamp(
                wind.speedMs /
                14,
                0,
                0.8
            );

        correction +=
            (
                upstreamMean -
                localMean
            ) *
            strength;
    }

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

    const frontal =
        moisture *
        front *
        (
            0.50 +
            0.50 *
            gradientLift
        );

    const convective =
        moisture *
        showers *
        lowLift *
        0.70;

    let potential =
        Math.max(
            frontal,
            convective
        ) *
        (
            0.60 +
            0.40 *
            cloud
        );

    if (
        moisture <
        0.28
    ) {

        potential *=
            0.18;
    }

    const precipitating =
        potential >
        0.36;

    const chance =
        clamp(
            (
                potential -
                0.16
            ) /
            0.58,
            0,
            1
        );

    const intensity =
        precipitating
            ? clamp(
                (
                    potential -
                    0.36
                ) /
                0.45,
                0.05,
                1
            )
            : 0;

    return {
        potential,
        precipitating,
        chance,
        intensity
    };
}


/* ==========================================================
   PRECIPITATION PHASE
========================================================== */

function phaseForTemperature(
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
   MAIN SIMULATION
========================================================== */

function simulate(
    latitude,
    longitude,
    date = new Date(),
    options = {}
) {

    if (
        !global.EuropaClimate ||
        typeof global.EuropaClimate.getIndices !==
        "function"
    ) {

        throw new Error(
            "EuropaClimate v3 must load before EuropaWeather."
        );
    }

    const d =
        asDate(date);

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

    const upstreamPoint =
        upstream(
            latitude,
            longitude,
            wind
        );

    const upstreamClimate =
        global.EuropaClimate.getIndices(
            upstreamPoint.lat,
            upstreamPoint.lon,
            {
                landFraction:
                    0.5
            }
        );

    const baselineMean =
        climatologicalMean(
            latitude,
            longitude,
            d,
            climate,
            landFraction
        );

    const advection =
        advectionCorrection(
            latitude,
            longitude,
            d,
            climate,
            upstreamClimate,
            wind,
            baselineMean
        );

    const preliminaryTemperature =
        baselineMean +
        advection;

    const moisture =
        moistureField(
            latitude,
            longitude,
            d,
            climate,
            upstreamClimate,
            wind,
            preliminaryTemperature,
            landFraction
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

    const diurnal =
        diurnalOffset(
            latitude,
            longitude,
            d,
            naturalDiurnalRange(
                climate,
                landFraction
            ),
            cloudFraction
        );

    const temperature =
        preliminaryTemperature +
        diurnal +
        (
            pressureValue -
            1014.5
        ) *
        0.04;

    const humidity =
        clamp(
            30 +
            moisture *
            66 +
            clamp(
                (
                    10 -
                    temperature
                ) *
                0.8,
                -8,
                12
            ),
            20,
            100
        );

    const precipitation =
        precipitationField(
            pressureValue,
            moisture,
            cloudFraction,
            gradient,
            front,
            showers
        );

    const precipitationType =
        phaseForTemperature(
            temperature,
            precipitation.precipitating
        );

    return {

        date:
            d.toISOString(),

        lat:
            latitude,

        lon:
            longitude,

        climate,

        pressureHpa:
            pressureValue,

        pressureGradient:
            gradient.magnitude,

        wind,

        baselineTemperatureC:
            baselineMean,

        advectionTemperatureC:
            advection,

        diurnalTemperatureC:
            diurnal,

        temperatureC:
            temperature,

        moisture,

        humidityPct:
            humidity,

        cloudFraction,

        frontalStrength:
            front,

        showerStrength:
            showers,

        precipitationPotential:
            precipitation.potential,

        precipitationChance:
            precipitation.chance,

        precipitationIntensity:
            precipitation.intensity,

        precipitationType

    };
}


/* ==========================================================
   PUBLIC API
========================================================== */

global.EuropaWeather =
    Object.freeze({

        version:
            "2.1-fixed",

        pressure,

        pressureGradient,

        windAt,

        simulate

    });

})(window);
