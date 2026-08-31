/* EuropaCraft Weather Engine v1
   Requires europacraft-climate-v3.js.

   Current stage:
   pressure -> wind -> advection -> temperature
   -> humidity -> cloud -> precipitation type
*/

(function (global) {

"use strict";

const DEG = Math.PI / 180;


function clamp(x, a, b) {

    return Math.max(
        a,
        Math.min(
            b,
            x
        )
    );

}


function dayNumber(date) {

    const d =
        date instanceof Date
            ? date
            : new Date(date);

    return (
        d.getTime() /
        86400000
    );

}


/* ==========================================================
   PRESSURE FIELD
========================================================== */

function pressure(
    latitude,
    longitude,
    date
) {

    const t =
        dayNumber(date);


    /*
     * Slowly moving planetary/synoptic waves.
     *
     * These are only the first atmospheric scaffold.
     *
     * Later we will replace / extend this with:
     *
     * persistent pressure systems
     * fronts
     * actual moving air masses
     * ensemble events
     * injected synoptic situations
     */

    const wave1 =
        8.0 *
        Math.sin(
            (
                longitude *
                1.35 +
                t *
                13.5
            ) *
            DEG
        ) *
        Math.cos(
            (
                latitude -
                52
            ) *
            2.0 *
            DEG
        );


    const wave2 =
        5.5 *
        Math.cos(
            (
                longitude *
                2.1 -
                t *
                8.0 +
                latitude *
                0.65
            ) *
            DEG
        );


    const wave3 =
        3.5 *
        Math.sin(
            (
                longitude *
                0.7 +
                t *
                4.5 -
                latitude *
                1.2
            ) *
            DEG
        );


    /*
     * Background North Atlantic storm-track tendency.
     */

    const atlanticLow =
        -5.0 *
        Math.exp(
            -(
                (
                    (
                        latitude -
                        59
                    ) /
                    12
                ) ** 2 +

                (
                    (
                        longitude +
                        13
                    ) /
                    20
                ) ** 2
            )
        );


    /*
     * Broad subtropical / Azores tendency.
     */

    const subtropicalHigh =
        4.0 *
        Math.exp(
            -(
                (
                    (
                        latitude -
                        36
                    ) /
                    9
                ) ** 2 +

                (
                    (
                        longitude +
                        7
                    ) /
                    22
                ) ** 2
            )
        );


    return (
        1015.0 +
        wave1 +
        wave2 +
        wave3 +
        atlanticLow +
        subtropicalHigh
    );

}


/* ==========================================================
   WIND
========================================================== */

function windAt(
    latitude,
    longitude,
    date
) {

    const step =
        0.35;


    const pressureNorth =
        pressure(
            latitude +
            step,
            longitude,
            date
        );


    const pressureSouth =
        pressure(
            latitude -
            step,
            longitude,
            date
        );


    const pressureEast =
        pressure(
            latitude,
            longitude +
            step,
            date
        );


    const pressureWest =
        pressure(
            latitude,
            longitude -
            step,
            date
        );


    const pressureGradientNorth =
        (
            pressureNorth -
            pressureSouth
        ) /
        (
            2 *
            step *
            111
        );


    const pressureGradientEast =
        (
            pressureEast -
            pressureWest
        ) /
        (
            2 *
            step *
            111 *
            Math.max(
                0.25,
                Math.cos(
                    latitude *
                    DEG
                )
            )
        );


    /*
     * Simplified Northern Hemisphere
     * geostrophic-style flow.
     *
     * u = west/east wind component.
     * v = south/north wind component.
     */

    let u =
        -pressureGradientNorth *
        720;


    let v =
        pressureGradientEast *
        720;


    let speed =
        Math.hypot(
            u,
            v
        );


    /*
     * Prevent ridiculous first-generation wind speeds.
     */

    if (
        speed >
        32
    ) {

        const correction =
            32 /
            speed;

        u *=
            correction;

        v *=
            correction;

        speed =
            Math.hypot(
                u,
                v
            );

    }


    /*
     * Meteorological direction:
     *
     * where the wind is FROM.
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
   WEATHER
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
            "EuropaClimate must load before EuropaWeather."
        );

    }


    const climate =
        global.EuropaClimate.getIndices(
            latitude,
            longitude,
            options
        );


    const baseline =
        global.EuropaClimate.getBaselineTemperature(
            latitude,
            longitude,
            date,
            options
        );


    const wind =
        windAt(
            latitude,
            longitude,
            date
        );


    const pressureValue =
        pressure(
            latitude,
            longitude,
            date
        );


    /*
     * Wind components.
     */

    const northerlyComponent =
        -wind.vMs;


    const easterlyComponent =
        wind.uMs;


    /*
     * First-generation temperature advection.
     *
     * Northerly flow cools.
     * Southerly flow warms.
     *
     * Continental easterlies have a greater effect
     * in continental climates.
     */

    const advectiveTemperature =
        -0.38 *
        northerlyComponent +

        0.10 *
        easterlyComponent *
        climate.indices.continental;


    /*
     * Weak pressure/air-mass adjustment.
     */

    const pressureTemperature =
        (
            pressureValue -
            1015
        ) *
        0.08;


    const temperature =
        baseline.meanC +
        advectiveTemperature +
        pressureTemperature;


    /*
     * Maritime locations generally support
     * higher atmospheric moisture.
     */

    const maritime =
        climate.indices.maritime;


    const humidity =
        clamp(

            52 +

            34 *
            maritime -

            0.75 *
            (
                pressureValue -
                1012
            ) +

            0.35 *
            wind.speedMs,

            28,
            99

        );


    /*
     * Lower pressure increases broad ascent.
     */

    const ascent =
        clamp(

            (
                1016 -
                pressureValue
            ) /
            14,

            0,
            1

        );


    /*
     * Cloud fraction.
     */

    const cloudFraction =
        clamp(

            0.12 +

            0.0065 *
            humidity +

            0.55 *
            ascent,

            0,
            1

        );


    /*
     * Precipitation probability.
     */

    const precipitationChance =
        clamp(

            (
                cloudFraction -
                0.58
            ) *
            1.85 +

            ascent *
            0.45,

            0,
            1

        );


    const precipitation =
        precipitationChance >
        0.50;


    /*
     * First precipitation phase thresholds.
     *
     * Later this should use:
     *
     * wet bulb temperature
     * 850 hPa temperature
     * boundary-layer profile
     * melting layer depth
     */

    const snow =
        precipitation &&
        temperature <=
        1.3;


    const sleet =
        precipitation &&
        temperature >
        1.3 &&
        temperature <=
        2.3;


    let precipitationType =
        "dry";


    if (
        precipitation
    ) {

        if (
            snow
        ) {

            precipitationType =
                "snow";

        }

        else if (
            sleet
        ) {

            precipitationType =
                "sleet";

        }

        else {

            precipitationType =
                "rain";

        }

    }


    return {

        date:
            (
                date instanceof Date
                    ? date
                    : new Date(date)
            ).toISOString(),

        lat:
            latitude,

        lon:
            longitude,

        pressureHpa:
            pressureValue,

        wind:
            wind,

        temperatureC:
            temperature,

        humidityPct:
            humidity,

        cloudFraction:
            cloudFraction,

        precipitationChance:
            precipitationChance,

        precipitationType:
            precipitationType,

        climate:
            climate

    };

}


/* ==========================================================
   PUBLIC API
========================================================== */

global.EuropaWeather =
    Object.freeze({

        version:
            "1.0",

        pressure:
            pressure,

        windAt:
            windAt,

        simulate:
            simulate

    });

})(window);
