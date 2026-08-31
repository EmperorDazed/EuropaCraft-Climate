(() => {
  'use strict';

  const U = EuropaUtils;
  const C = EuropaConfig;

  const TYPES =
    Object.freeze([
      'Atlantic',
      'Polar Maritime',
      'Arctic Maritime',
      'Greenland Ice-Sheet',
      'North Sea',
      'Baltic Maritime',
      'Mediterranean',
      'Black Sea',
      'Caspian Maritime',
      'North African',
      'Eurasian Continental',
      'British Landmass',
      'Iberian Interior',
      'West-Central European',
      'Central / Eastern European',
      'Scandinavian Interior',
      'Balkan Modified',
      'Anatolian Interior'
    ]);

  function seasonalPhase(
    date,
    peakDay = 205
  ) {
    const day =
      U.dayOfYear(date);

    return Math.cos(
      2 *
      Math.PI *
      (
        day -
        peakDay
      ) /
      365.2422
    );
  }

  function regionalIndices(
    lat,
    lon,
    geography
  ) {
    const coastKm =
      U.bilerpArray(
        geography
          .distanceToCoastKm,

        U.lonToX(
          lon,
          C.grid.nx
        ),

        U.latToY(
          lat,
          C.grid.ny
        ),

        C.grid.nx,
        C.grid.ny
      );

    const gx =
      Math.round(
        U.clamp(
          U.lonToX(
            lon,
            C.grid.nx
          ),
          0,
          C.grid.nx - 1
        )
      );

    const gy =
      Math.round(
        U.clamp(
          U.latToY(
            lat,
            C.grid.ny
          ),
          0,
          C.grid.ny - 1
        )
      );

    const land =
      geography
        .landMask[
          gy *
          C.grid.nx +
          gx
        ] ||
      0;

    const atlantic =
      U.clamp(
        1 -
        Math.max(
          0,
          lon + 2
        ) /
        34,
        0,
        1
      ) *
      U.clamp(
        1 -
        coastKm /
        900,
        0,
        1
      );

    const continental =
      land
        ?
          U.clamp(
            (
              lon + 5
            ) /
            45,
            0,
            1
          ) *
          U.clamp(
            coastKm /
            650,
            0,
            1
          )
        :
          0;

    const mediterranean =
      U.clamp(
        (
          46 -
          lat
        ) /
        12,
        0,
        1
      ) *
      U.clamp(
        1 -
        Math.abs(
          lon - 16
        ) /
        32,
        0,
        1
      );

    const arctic =
      U.clamp(
        (
          lat -
          58
        ) /
        16,
        0,
        1
      );

    const northSea =
      U.gaussian2D(
        lat,
        lon,
        56,
        4,
        6,
        10
      );

    const baltic =
      U.gaussian2D(
        lat,
        lon,
        58,
        20,
        6,
        12
      );

    const blackSea =
      U.gaussian2D(
        lat,
        lon,
        43,
        34,
        4,
        10
      );

    const northAfrican =
      U.clamp(
        (
          36 -
          lat
        ) /
        6,
        0,
        1
      );

    return {
      atlantic,
      continental,
      mediterranean,
      arctic,
      northSea,
      baltic,
      blackSea,
      northAfrican,
      coastKm,
      land
    };
  }

  function baselineTemperature(
    lat,
    lon,
    date,
    geography,
    elevationM = 0
  ) {
    const idx =
      regionalIndices(
        lat,
        lon,
        geography
      );

    const season =
      seasonalPhase(date);

    let annualMean =
      15.2 -
      0.52 *
      (
        lat -
        40
      );

    annualMean +=
      idx.atlantic *
      1.4;

    annualMean +=
      idx.mediterranean *
      2.6;

    annualMean -=
      idx.arctic *
      4.0;

    annualMean -=
      idx.continental *
      0.6;

    annualMean +=
      idx.northAfrican *
      4.0;

    let amplitude =
      8.0 +
      idx.continental *
      8.0 +
      idx.baltic *
      2.0 -
      idx.atlantic *
      4.3 -
      idx.mediterranean *
      1.6;

    amplitude =
      U.clamp(
        amplitude,
        4.5,
        18
      );

    let temperature =
      annualMean +
      amplitude *
      season;

    temperature -=
      0.0065 *
      elevationM;

    temperature +=
      0.8 *
      U.gaussian2D(
        lat,
        lon,
        43.2,
        16.5,
        2.0,
        4.0
      );

    temperature -=
      0.8 *
      U.gaussian2D(
        lat,
        lon,
        46.3,
        24.5,
        2.5,
        4.5
      );

    temperature +=
      0.6 *
      U.gaussian2D(
        lat,
        lon,
        58.0,
        6.0,
        5.0,
        4.0
      );

    temperature -=
      0.7 *
      U.gaussian2D(
        lat,
        lon,
        60.5,
        16.0,
        5.0,
        6.0
      );

    temperature -=
      0.5 *
      U.gaussian2D(
        lat,
        lon,
        52.5,
        18.0,
        3.5,
        7.0
      );

    return temperature;
  }

  function diurnalAmplitude(
    lat,
    lon,
    date,
    geography,
    groundMoisture = 0.5,
    cloud = 0
  ) {
    const idx =
      regionalIndices(
        lat,
        lon,
        geography
      );

    const midday =
      new Date(
        Date.UTC(
          date.getUTCFullYear(),
          date.getUTCMonth(),
          date.getUTCDate(),
          12
        )
      );

    const solar =
      U.clamp(
        U.solarCosZenith(
          lat,
          lon,
          midday
        ),
        0,
        1
      );

    let amplitude =
      4.0 +
      4.5 *
      idx.continental +
      2.2 *
      solar -
      2.0 *
      idx.atlantic;

    amplitude *=
      1 -
      0.45 *
      U.clamp(
        groundMoisture,
        0,
        1
      );

    amplitude *=
      1 -
      0.75 *
      U.clamp(
        cloud,
        0,
        1
      );

    return U.clamp(
      amplitude,
      0.8,
      10.5
    );
  }

  function hourlyClimatology(
    lat,
    lon,
    date,
    geography,
    elevationM = 0,
    groundMoisture = 0.5,
    cloud = 0
  ) {
    const mean =
      baselineTemperature(
        lat,
        lon,
        date,
        geography,
        elevationM
      );

    const amplitude =
      diurnalAmplitude(
        lat,
        lon,
        date,
        geography,
        groundMoisture,
        cloud
      );

    const localSolarHour =
      (
        date.getUTCHours() +
        date.getUTCMinutes() /
        60 +
        lon /
        15 +
        24
      ) %
      24;

    const diurnal =
      Math.sin(
        2 *
        Math.PI *
        (
          localSolarHour -
          9
        ) /
        24
      );

    return (
      mean +
      amplitude *
      diurnal
    );
  }

  function sourceWeights(
    lat,
    lon,
    geography
  ) {
    const i =
      regionalIndices(
        lat,
        lon,
        geography
      );

    const raw = {};

    for (
      const type
      of TYPES
    ) {
      raw[type] = 0;
    }

    raw['Atlantic'] =
      i.atlantic;

    raw['Polar Maritime'] =
      i.atlantic *
      U.clamp(
        (
          lat -
          48
        ) /
        18,
        0,
        1
      );

    raw['Arctic Maritime'] =
      i.arctic *
      (
        0.5 +
        i.atlantic *
        0.5
      );

    raw['North Sea'] =
      i.northSea;

    raw['Baltic Maritime'] =
      i.baltic;

    raw['Mediterranean'] =
      i.mediterranean;

    raw['Black Sea'] =
      i.blackSea;

    raw['North African'] =
      i.northAfrican;

    raw['Eurasian Continental'] =
      i.continental *
      U.clamp(
        (
          lon -
          15
        ) /
        25,
        0,
        1
      );

    raw['British Landmass'] =
      U.gaussian2D(
        lat,
        lon,
        54,
        -3,
        5,
        5
      );

    raw['Iberian Interior'] =
      U.gaussian2D(
        lat,
        lon,
        40,
        -4,
        4,
        6
      ) *
      i.land;

    raw['West-Central European'] =
      U.gaussian2D(
        lat,
        lon,
        49,
        5,
        6,
        10
      ) *
      i.land;

    raw['Central / Eastern European'] =
      U.gaussian2D(
        lat,
        lon,
        51,
        20,
        7,
        12
      ) *
      i.land;

    raw['Scandinavian Interior'] =
      U.gaussian2D(
        lat,
        lon,
        62,
        16,
        6,
        8
      ) *
      i.land;

    raw['Balkan Modified'] =
      U.gaussian2D(
        lat,
        lon,
        43,
        22,
        5,
        9
      ) *
      i.land;

    raw['Anatolian Interior'] =
      U.gaussian2D(
        lat,
        lon,
        39,
        33,
        4,
        9
      ) *
      i.land;

    raw['Caspian Maritime'] =
      U.gaussian2D(
        lat,
        lon,
        42,
        48,
        5,
        7
      );

    raw['Greenland Ice-Sheet'] =
      U.gaussian2D(
        lat,
        lon,
        70,
        -25,
        5,
        8
      );

    return raw;
  }

  window.EuropaClimate =
    Object.freeze({
      version: '8.0.0',
      TYPES,
      regionalIndices,
      baselineTemperature,
      hourlyClimatology,
      sourceWeights
    });
})();
