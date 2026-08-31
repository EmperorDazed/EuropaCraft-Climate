(() => {
  'use strict';

  const U = EuropaUtils;
  const C = EuropaConfig;

  const palettes = {
    temperature: [
      [-30, [55, 43, 128]],
      [-15, [68, 105, 196]],
      [0, [120, 190, 230]],
      [10, [110, 205, 150]],
      [20, [245, 220, 95]],
      [30, [235, 120, 65]],
      [40, [170, 45, 55]]
    ],

    anomaly: [
      [-15, [60, 65, 170]],
      [-8, [92, 130, 210]],
      [-3, [170, 205, 235]],
      [0, [235, 235, 235]],
      [3, [245, 190, 140]],
      [8, [215, 95, 70]],
      [15, [145, 35, 45]]
    ],

    pressure: [
      [940, [80, 70, 180]],
      [980, [100, 145, 220]],
      [1015, [205, 220, 220]],
      [1040, [235, 185, 100]],
      [1070, [190, 80, 65]]
    ],

    wind: [
      [0, [225, 235, 235]],
      [5, [135, 205, 220]],
      [15, [90, 170, 120]],
      [30, [230, 190, 75]],
      [50, [210, 80, 70]]
    ],

    humidity: [
      [0, [235, 220, 180]],
      [40, [185, 210, 180]],
      [70, [110, 185, 170]],
      [100, [65, 120, 160]]
    ],

    cloud: [
      [0, [40, 48, 58]],
      [0.4, [120, 130, 140]],
      [1, [235, 238, 240]]
    ],

    precip: [
      [0, [0, 0, 0, 0]],
      [0.1, [110, 185, 235, 120]],
      [2, [65, 135, 220, 190]],
      [8, [70, 190, 130, 220]],
      [20, [245, 205, 70, 235]],
      [40, [220, 75, 65, 245]]
    ],

    snow: [
      [0, [50, 55, 60]],
      [1, [170, 195, 220]],
      [10, [225, 235, 245]],
      [40, [255, 255, 255]]
    ],

    ground: [
      [-20, [65, 75, 160]],
      [0, [135, 190, 220]],
      [15, [125, 190, 120]],
      [30, [230, 180, 80]],
      [45, [190, 70, 55]]
    ],

    sst: [
      [-2, [65, 85, 170]],
      [5, [80, 150, 205]],
      [15, [100, 195, 175]],
      [25, [235, 185, 85]],
      [31, [210, 80, 60]]
    ],

    seaice: [
      [0, [45, 70, 90, 0]],
      [0.1, [160, 205, 225, 120]],
      [1, [240, 250, 255, 245]]
    ]
  };

  function colorFor(
    value,
    stops
  ) {
    if (
      !Number.isFinite(value)
    ) {
      return [
        0,
        0,
        0,
        0
      ];
    }

    if (
      value <=
      stops[0][0]
    ) {
      const color =
        stops[0][1];

      return color.length === 4
        ?
          color
        :
          [
            ...color,
            255
          ];
    }

    for (
      let i = 1;
      i < stops.length;
      i++
    ) {
      if (
        value <=
        stops[i][0]
      ) {
        const v0 =
          stops[i - 1][0];

        const c0 =
          stops[i - 1][1];

        const v1 =
          stops[i][0];

        const c1 =
          stops[i][1];

        const t =
          (
            value -
            v0
          ) /
          (
            v1 -
            v0 ||
            1
          );

        const result = [];

        for (
          let channel = 0;
          channel < 4;
          channel++
        ) {
          result[channel] =
            Math.round(
              U.lerp(
                c0[channel] ??
                255,

                c1[channel] ??
                255,

                t
              )
            );
        }

        return result;
      }
    }

    const color =
      stops[
        stops.length - 1
      ][1];

    return color.length === 4
      ?
        color
      :
        [
          ...color,
          255
        ];
  }

  function interpField(
    previous,
    current,
    key,
    fraction,
    x,
    y
  ) {
    const a =
      U.bilerpArray(
        previous[key],
        x,
        y,
        C.grid.nx,
        C.grid.ny
      );

    const b =
      U.bilerpArray(
        current[key],
        x,
        y,
        C.grid.nx,
        C.grid.ny
      );

    return U.lerp(
      a,
      b,
      fraction
    );
  }

  class Renderer {
    constructor(
      world,
      fieldCanvas,
      overlayCanvas,
      particleCanvas
    ) {
      this.world =
        world;

      this.fieldCanvas =
        fieldCanvas;

      this.overlayCanvas =
        overlayCanvas;

      this.particleCanvas =
        particleCanvas;

      this.fctx =
        fieldCanvas
          .getContext(
            '2d'
          );

      this.octx =
        overlayCanvas
          .getContext(
            '2d'
          );

      this.pctx =
        particleCanvas
          .getContext(
            '2d'
          );

      this.layer =
        'temperature';

      this.showIsobars =
        true;

      this.showFronts =
        false;

      this.showParticles =
        true;

      this.lastField =
        0;

      this.particles =
        [];

      this._initParticles();
    }

    _initParticles() {
      this.particles.length =
        0;

      for (
        let i = 0;
        i < C.renderer.particleCount;
        i++
      ) {
        this.particles.push({
          x:
            Math.random() *
            C.display.width,

          y:
            Math.random() *
            C.display.height,

          age:
            Math.random() *
            160
        });
      }
    }

    setLayer(value) {
      this.layer =
        value;

      this.lastField =
        0;
    }

    _valueAt(
      previous,
      current,
      fraction,
      gx,
      gy
    ) {
      switch (
        this.layer
      ) {
        case 'temperature':
          return interpField(
            previous,
            current,
            'tempC',
            fraction,
            gx,
            gy
          );

        case 'anomaly':
          return interpField(
            previous,
            current,
            'anomalyC',
            fraction,
            gx,
            gy
          );

        case 'pressure':
          return interpField(
            previous,
            current,
            'pressureHpa',
            fraction,
            gx,
            gy
          );

        case 'wind': {
          const u =
            interpField(
              previous,
              current,
              'u',
              fraction,
              gx,
              gy
            );

          const v =
            interpField(
              previous,
              current,
              'v',
              fraction,
              gx,
              gy
            );

          return Math.hypot(
            u,
            v
          );
        }

        case 'humidity':
          return interpField(
            previous,
            current,
            'rh',
            fraction,
            gx,
            gy
          );

        case 'dewpoint':
          return interpField(
            previous,
            current,
            'dewPointC',
            fraction,
            gx,
            gy
          );

        case 'cloud':
          return interpField(
            previous,
            current,
            'cloud',
            fraction,
            gx,
            gy
          );

        case 'precip':
          return interpField(
            previous,
            current,
            'precipRate',
            fraction,
            gx,
            gy
          );

        case 'snow':
          return interpField(
            previous,
            current,
            'snowDepth',
            fraction,
            gx,
            gy
          );

        case 'ground':
          return interpField(
            previous,
            current,
            'groundTemp',
            fraction,
            gx,
            gy
          );

        case 'sst':
          return interpField(
            previous,
            current,
            'sstC',
            fraction,
            gx,
            gy
          );

        case 'seaice':
          return interpField(
            previous,
            current,
            'seaIce',
            fraction,
            gx,
            gy
          );

        default:
          return interpField(
            previous,
            current,
            'tempC',
            fraction,
            gx,
            gy
          );
      }
    }

    _palette() {
      return (
        palettes[
          this.layer
        ] ||
        palettes.temperature
      );
    }

    drawField(
      fraction,
      now =
        performance.now()
    ) {
      if (
        now -
        this.lastField <
        C.renderer
          .fieldRefreshMs
      ) {
        return;
      }

      this.lastField =
        now;

      const previous =
        this.world
          .prevDisplayState;

      const current =
        this.world
          .currDisplayState;

      if (
        !previous ||
        !current
      ) {
        return;
      }

      const width =
        C.display.width;

      const height =
        C.display.height;

      const nx =
        C.grid.nx;

      const ny =
        C.grid.ny;

      const image =
        this.fctx
          .createImageData(
            width,
            height
          );

      const data =
        image.data;

      for (
        let y = 0;
        y < height;
        y++
      ) {
        const gy =
          y /
          (
            height - 1
          ) *
          (
            ny - 1
          );

        for (
          let x = 0;
          x < width;
          x++
        ) {
          const gx =
            x /
            (
              width - 1
            ) *
            (
              nx - 1
            );

          const i =
            (
              y *
              width +
              x
            ) *
            4;

          const value =
            this._valueAt(
              previous,
              current,
              fraction,
              gx,
              gy
            );

          let color =
            colorFor(
              value,
              this._palette()
            );

          if (
            this.layer ===
            'precip' &&
            value < 0.03
          ) {
            color = [
              0,
              0,
              0,
              0
            ];
          }

          data[i] =
            color[0];

          data[i + 1] =
            color[1];

          data[i + 2] =
            color[2];

          data[i + 3] =
            color[3];
        }
      }

      this.fctx
        .putImageData(
          image,
          0,
          0
        );
    }

    drawOverlay(
      fraction
    ) {
      const ctx =
        this.octx;

      ctx.clearRect(
        0,
        0,
        C.display.width,
        C.display.height
      );

      if (
        this.showIsobars
      ) {
        this._drawIsobars(
          ctx,
          fraction
        );
      }

      if (
        this.showFronts
      ) {
        this._drawFronts(
          ctx,
          fraction
        );
      }

      this._drawCoast(ctx);

      this._drawStations(ctx);

      this._drawSteering(ctx);
    }

    _drawCoast(ctx) {
      ctx.save();

      ctx.strokeStyle =
        'rgba(255,255,255,.72)';

      ctx.lineWidth =
        0.8;

      ctx.beginPath();

      for (
        const feature
        of this.world
          .geography
          .landGeoJSON
          .features ||
        []
      ) {
        EuropaTerrain
          .traceGeometry(
            ctx,
            feature.geometry,
            C.display.width,
            C.display.height
          );
      }

      ctx.stroke();

      ctx.restore();
    }

    _drawIsobars(
      ctx,
      fraction
    ) {
      const p0 =
        this.world
          .prevDisplayState
          .pressureHpa;

      const p1 =
        this.world
          .currDisplayState
          .pressureHpa;

      const nx =
        C.grid.nx;

      const ny =
        C.grid.ny;

      const width =
        C.display.width;

      const height =
        C.display.height;

      ctx.save();

      ctx.strokeStyle =
        'rgba(255,255,255,.58)';

      ctx.lineWidth =
        0.65;

      for (
        let level = 944;
        level <= 1064;
        level +=
          C.renderer
            .isobarIntervalHpa
      ) {
        ctx.beginPath();

        for (
          let y = 0;
          y < ny - 1;
          y++
        ) {
          for (
            let x = 0;
            x < nx - 1;
            x++
          ) {
            const i =
              y * nx + x;

            const values = [
              U.lerp(
                p0[i],
                p1[i],
                fraction
              ),

              U.lerp(
                p0[i + 1],
                p1[i + 1],
                fraction
              ),

              U.lerp(
                p0[
                  i +
                  nx +
                  1
                ],
                p1[
                  i +
                  nx +
                  1
                ],
                fraction
              ),

              U.lerp(
                p0[i + nx],
                p1[i + nx],
                fraction
              )
            ];

            const points =
              [];

            const edges = [
              [0, 1, 0.5, 0],
              [1, 2, 1, 0.5],
              [2, 3, 0.5, 1],
              [3, 0, 0, 0.5]
            ];

            for (
              const edge
              of edges
            ) {
              if (
                (
                  values[
                    edge[0]
                  ] <
                  level
                ) !==
                (
                  values[
                    edge[1]
                  ] <
                  level
                )
              ) {
                points.push([
                  edge[2],
                  edge[3]
                ]);
              }
            }

            if (
              points.length ===
              2 ||
              points.length ===
              4
            ) {
              for (
                let segment = 0;
                segment < points.length;
                segment += 2
              ) {
                const a =
                  points[
                    segment
                  ];

                const b =
                  points[
                    segment + 1
                  ];

                if (!b) {
                  break;
                }

                ctx.moveTo(
                  (
                    x +
                    a[0]
                  ) /
                  (
                    nx - 1
                  ) *
                  width,

                  (
                    y +
                    a[1]
                  ) /
                  (
                    ny - 1
                  ) *
                  height
                );

                ctx.lineTo(
                  (
                    x +
                    b[0]
                  ) /
                  (
                    nx - 1
                  ) *
                  width,

                  (
                    y +
                    b[1]
                  ) /
                  (
                    ny - 1
                  ) *
                  height
                );
              }
            }
          }
        }

        ctx.stroke();
      }

      ctx.restore();
    }

    _drawFronts(
      ctx,
      fraction
    ) {
      const f0 =
        this.world
          .prevDisplayState
          .front;

      const f1 =
        this.world
          .currDisplayState
          .front;

      const nx =
        C.grid.nx;

      const ny =
        C.grid.ny;

      ctx.save();

      ctx.strokeStyle =
        'rgba(255,235,130,.68)';

      ctx.lineWidth =
        1.2;

      for (
        let y = 1;
        y < ny - 1;
        y++
      ) {
        for (
          let x = 1;
          x < nx - 1;
          x++
        ) {
          const i =
            y * nx + x;

          const value =
            U.lerp(
              f0[i],
              f1[i],
              fraction
            );

          if (
            value > 0.72
          ) {
            ctx.beginPath();

            ctx.moveTo(
              x /
              (
                nx - 1
              ) *
              C.display.width,

              y /
              (
                ny - 1
              ) *
              C.display.height
            );

            ctx.lineTo(
              (
                x + 1
              ) /
              (
                nx - 1
              ) *
              C.display.width,

              (
                y + 0.3
              ) /
              (
                ny - 1
              ) *
              C.display.height
            );

            ctx.stroke();
          }
        }
      }

      ctx.restore();
    }

    _drawStations(ctx) {
      ctx.save();

      ctx.font =
        '11px system-ui';

      ctx.textBaseline =
        'middle';

      for (
        const station
        of this.world.stations
      ) {
        const x =
          U.lonToX(
            station.lon,
            C.display.width
          );

        const y =
          U.latToY(
            station.lat,
            C.display.height
          );

        ctx.fillStyle =
          '#ffffff';

        ctx.beginPath();

        ctx.arc(
          x,
          y,
          3,
          0,
          Math.PI * 2
        );

        ctx.fill();

        ctx.fillStyle =
          'rgba(0,0,0,.72)';

        ctx.fillRect(
          x + 5,
          y - 8,
          Math.max(
            36,
            station.name.length *
            6 +
            8
          ),
          16
        );

        ctx.fillStyle =
          '#ffffff';

        ctx.fillText(
          station.name,
          x + 9,
          y
        );
      }

      ctx.restore();
    }

    _drawSteering(ctx) {
      ctx.save();

      ctx.lineCap =
        'round';

      ctx.lineJoin =
        'round';

      ctx.strokeStyle =
        'rgba(255,220,90,.95)';

      ctx.lineWidth =
        2;

      for (
        const path
        of this.world
          .synoptic
          .paths
      ) {
        if (
          path.points.length <
          2
        ) {
          continue;
        }

        ctx.beginPath();

        path.points.forEach(
          (
            point,
            index
          ) => {
            const x =
              U.lonToX(
                point.lon,
                C.display.width
              );

            const y =
              U.latToY(
                point.lat,
                C.display.height
              );

            if (
              index === 0
            ) {
              ctx.moveTo(
                x,
                y
              );
            } else {
              ctx.lineTo(
                x,
                y
              );
            }
          }
        );

        ctx.stroke();
      }

      ctx.restore();
    }

    drawParticles(
      fraction,
      dtMs
    ) {
      if (
        !this.showParticles
      ) {
        this.pctx
          .clearRect(
            0,
            0,
            C.display.width,
            C.display.height
          );

        return;
      }

      const ctx =
        this.pctx;

      const width =
        C.display.width;

      const height =
        C.display.height;

      const nx =
        C.grid.nx;

      const ny =
        C.grid.ny;

      ctx.fillStyle =
        `rgba(8,12,18,${
          1 -
          C.renderer
            .particleTrail
        })`;

      ctx.fillRect(
        0,
        0,
        width,
        height
      );

      ctx.fillStyle =
        'rgba(255,255,255,.62)';

      const previous =
        this.world
          .prevDisplayState;

      const current =
        this.world
          .currDisplayState;

      const scale =
        0.018 *
        (
          dtMs ||
          16
        );

      for (
        const particle
        of this.particles
      ) {
        const gx =
          particle.x /
          (
            width - 1
          ) *
          (
            nx - 1
          );

        const gy =
          particle.y /
          (
            height - 1
          ) *
          (
            ny - 1
          );

        const u =
          interpField(
            previous,
            current,
            'u',
            fraction,
            gx,
            gy
          );

        const v =
          interpField(
            previous,
            current,
            'v',
            fraction,
            gx,
            gy
          );

        const oldX =
          particle.x;

        const oldY =
          particle.y;

        particle.x +=
          u *
          scale;

        particle.y -=
          v *
          scale;

        particle.age +=
          1;

        if (
          particle.x < 0 ||
          particle.x >= width ||
          particle.y < 0 ||
          particle.y >= height ||
          particle.age > 220
        ) {
          particle.x =
            Math.random() *
            width;

          particle.y =
            Math.random() *
            height;

          particle.age =
            0;

          continue;
        }

        ctx.fillRect(
          oldX,
          oldY,
          1.2,
          1.2
        );
      }
    }
  }

  window.EuropaRenderer =
    Object.freeze({
      Renderer
    });
})();
