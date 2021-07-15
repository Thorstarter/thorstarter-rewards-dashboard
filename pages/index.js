import { useState, useEffect } from "react";
import * as ethers from "ethers";
import Head from "next/head";
import Image from "next/image";
import Layout from "../components/Layout";
import styles from "../styles/Home.module.css";
import { tokenAbi, stakingAbi, sushiSwapPoolAbi } from "../utils/abis";

// test address thor16slycxn5twp2454pu785n34vq0u4mag8588xcy
// test eth address 0x120fb4D4b80DC98BF27341f0D98F0CCedFEeFDd4

const API = "https://midgard.thorchain.info/v2";
const POOL = "ETH.XRUNE-0X69FA0FEE221AD11012BAB0FDB45D444D3D2CE71C";

const parseUnits = ethers.utils.parseUnits;
const formatUnits = ethers.utils.formatUnits;
const provider = new ethers.providers.JsonRpcProvider(
  "https://mainnet.infura.io/v3/f0039abafaab4ecf9b573383a5eba292"
);
const Token = new ethers.Contract(
  "0x69fa0fee221ad11012bab0fdb45d444d3d2ce71c",
  tokenAbi,
  provider
);
const Staking = new ethers.Contract(
  "0x93F5Dc8bC383BB5381a67A67516A163d1E56012a",
  stakingAbi,
  provider
);
const SushiSwapPool = new ethers.Contract(
  "0x95cfa1f48fad82232772d3b1415ad4393517f3b5",
  sushiSwapPoolAbi,
  provider
);
const LpToken = new ethers.Contract(
  "0x95cfa1f48fad82232772d3b1415ad4393517f3b5",
  tokenAbi,
  provider
);

const msInADay = 1000 * 60 * 60 * 24;
const rewardsStart = new Date(2021, 6, 4).getTime();
const rewardsAPRDStart = 0.004424657534246575;
const rewardsAPRDEnd = 0.001123287671232877;
const rewardsDayChange = (rewardsAPRDStart - rewardsAPRDEnd) / 60;

const fetchJson = (url) =>
  fetch(API + url).then((r) => {
    if (!r.ok) throw new Error("Non 2xx status code: " + r.status);
    return r.json();
  });

/*
  position
  {
    assetAdded: "500000000"
    assetAddress: "0xb0ffc2e19dd0f4d4ac766e83bc773f9f3c1a0006"
    assetWithdrawn: "0"
    dateFirstAdded: "1625239353"
    dateLastAdded: "1625240397"
    liquidityUnits: "39206423236"
    pool: "ETH.XRUNE-0X69FA0FEE221AD11012BAB0FDB45D444D3D2CE71C"
    runeAdded: "300076000000"
    runeAddress: "thor16slycxn5twp2454pu785n34vq0u4mag8588xcy"
    runeWithdrawn: "0"
  }

  history
  [{
    assetDepth: "6362432149678560"
    assetPrice: "0.030035187187368043"
    assetPriceUSD: "0.17419096350314783"
    endTime: "1625270400"
    liquidityUnits: "42346106139621"
    runeDepth: "191096840582524"
    startTime: "1625184000"
  }]
*/

function formatDate(ts) {
  const d = new Date(parseInt(ts) * 1000);
  const pad = (s) => ("0" + s).slice(-2);
  return [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())].join("-");
}

function aprdToApy(rate) {
  return Math.pow(1 + rate, 365) - 1;
}

function formatLargeNumber(n) {
  if (Number.isNaN(n)) return "Infinity";
  if (n > 1000000000000000000) return ">1000Q";
  if (n > 1000000000000000) return (n / 1000000000000000).toFixed(1) + "Q";
  if (n > 1000000000000) return (n / 1000000000000).toFixed(1) + "T";
  if (n > 1000000000) return (n / 1000000000).toFixed(1) + "B";
  if (n > 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n > 10000) return (n / 1000).toFixed(1) + "K";
  return n.toFixed(1);
}

export default function Home() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [position, setPosition] = useState();
  const [history, setHistory] = useState();
  const [sushiPosition, setSushiPosition] = useState();
  const [sushiHistory, setSushiHistory] = useState();
  const [staking, setStaking] = useState();

  async function loadLpThorchain(address) {
    try {
      setLoading(true);
      const positions = (await fetchJson(`/member/${address}`)).pools;
      const xrunePosition = positions.find((p) => p.pool === POOL);
      if (!xrunePosition) {
        setError("No XRUNE LP found for this address.");
        return;
      }
      const history = (
        await fetchJson(
          `/history/depths/${POOL}?interval=day&count=60&from=${xrunePosition.dateFirstAdded}`
        )
      ).intervals;
      const enrichedHistory = [];
      for (let h of history) {
        const liqPercentage =
          parseInt(xrunePosition.liquidityUnits) / parseInt(h.liquidityUnits);
        const value =
          (parseInt(h.assetDepth) / Math.pow(10, 8)) *
          2 *
          liqPercentage *
          parseFloat(h.assetPriceUSD);
        const growth =
          enrichedHistory.length > 0 ? value / enrichedHistory[0].value - 1 : 0;

        const currentTs = parseInt(h.startTime) * 1000;
        const rewardsDay = Math.ceil((currentTs - rewardsStart) / msInADay);
        let rewardsAPRDNow = rewardsAPRDStart - rewardsDayChange * rewardsDay;
        if (currentTs < rewardsStart - msInADay) rewardsAPRDNow = 0;

        enrichedHistory.splice(0, 0, {
          assetAmount:
            (parseInt(h.assetDepth) / Math.pow(10, 8)) * liqPercentage,
          runeAmount: (parseInt(h.runeDepth) / Math.pow(10, 8)) * liqPercentage,
          value: value,
          growth: growth,
          pool: h,
          position: xrunePosition,
          tsRewards: value * rewardsAPRDNow,
          tsRewardsApy: aprdToApy(rewardsAPRDNow),
        });
      }

      setHistory(enrichedHistory);
      setPosition(xrunePosition);
    } catch (err) {
      if (err.toString().includes("404")) {
        setError("No XRUNE LP found for this address.");
        return;
      }
      setError("Error: " + err.toString());
    } finally {
      setLoading(false);
    }
  }

  async function loadLpSushiSwap(address) {
    try {
      setLoading(true);
      const data = await fetch(
        "https://api.thegraph.com/subgraphs/name/sushiswap/exchange",
        {
          method: "POST",
          body: JSON.stringify({
            query: `{
            liquidityPosition(id: "0x95cfa1f48fad82232772d3b1415ad4393517f3b5-${address}") {
              snapshots(orderBy: timestamp, orderDirection: desc) {
                timestamp
                liquidityTokenBalance
              }
            }
            pair(id: "0x95cfa1f48fad82232772d3b1415ad4393517f3b5") {
              dayData(first: 30, orderBy: date, orderDirection: desc) {
                date
                reserve0
                reserve1
                reserveUSD
                totalSupply
              }
            }
          }`,
            variables: null,
          }),
        }
      ).then((r) => r.json());

      if ((data.data.liquidityPosition?.snapshots || []).length === 0) {
        const lpTokensBalance = parseFloat(formatUnits(await LpToken.balanceOf(address)));
        console.log(lpTokensBalance);
        if (lpTokensBalance === 0) {
          return;
        }
        data.data.liquidityPosition = {
          snapshots: [{
            timestamp: 0,
            liquidityTokenBalance: lpTokensBalance,
          }],
        };
      }

      const history = [];
      for (let day of data.data.pair.dayData.reverse()) {
        const position = data.data.liquidityPosition?.snapshots.find(
          (s) => s.timestamp < day.date
        );
        const shareAmount = parseFloat(
          position ? position.liquidityTokenBalance : "0"
        );
        const poolShare = shareAmount / parseFloat(day.totalSupply);
        const value = poolShare * parseFloat(day.reserveUSD);
        const growth =
          history.length > 0 && history[0].value
            ? value / history[0].value - 1
            : 0;

        const currentTs = day.date * 1000;
        const rewardsDay = Math.ceil((currentTs - rewardsStart) / msInADay);
        let rewardsAPRDNow = rewardsAPRDStart - rewardsDayChange * rewardsDay;
        if (currentTs < rewardsStart - msInADay) rewardsAPRDNow = 0;

        history.splice(0, 0, {
          date: day.date,
          price: parseFloat(day.reserveUSD) / 2 / parseFloat(day.reserve0),
          amountToken: poolShare * parseFloat(day.reserve0),
          amountEth: poolShare * parseFloat(day.reserve1),
          value: value,
          growth: growth,
          tsRewards: value * rewardsAPRDNow,
          tsRewardsApy: aprdToApy(rewardsAPRDNow),
        });
      }
      setSushiHistory(history);
      setSushiPosition({ value: history.length > 0 ? history[0].value : 0 });
    } catch (err) {
      setError("Error: " + err.toString());
    } finally {
      setLoading(false);
    }
  }

  async function loadStaking(address) {

    let xrunePrice = 0;
    try{

      const cmc = await fetch('https://1e35cbc19de1456caf8c08b2b4ead7d2.thorstarter.org/595cf62030316481c442e0ed49580de5/')
          .then(res => res.text());

      xrunePrice = parseFloat(cmc);

      if(isNaN(xrunePrice)){
        xrunePrice = 0;
      }

      // console.log(cmc);
      // setError(parseFloat(cmc));
    }catch (err){
      // console.log(err.toString());
      // setError("Error: " + err.toString());
    }

    try {
      setLoading(true);
      if(xrunePrice === 0){
        const [b0, b1] = await SushiSwapPool.getReserves();
        xrunePrice = 2376 / (b0.mul("10000").div(b1).toNumber() / 10000);
      }

      const balance = await Token.balanceOf(address);
      const staked = (await Staking.userInfo(0, address))[0];
      const pending = await Staking.pendingRewards(0, address);
      const staking = {
        balance: parseFloat(formatUnits(balance)),
        staked: parseFloat(formatUnits(staked)),
        pending: parseFloat(formatUnits(pending)),
        price: xrunePrice,
      };
      if (staking.balance === 0 && staking.staked === 0) {
        return;
      }
      setStaking(staking);
    } catch (err) {
      setError("Error: " + err.toString());
    } finally {
      setLoading(false);
    }
  }

  async function load(address) {
    if (address.startsWith("thor")) {
      setPosition();
      setHistory();
      loadLpThorchain(address);
    }
    if (address.startsWith("0x")) {
      setSushiPosition();
      setSushiHistory();
      setStaking();
      loadLpSushiSwap(address);
      loadStaking(address);
    }
  }

  function onLoad(e) {
    e.preventDefault();
    window.history.pushState("", null, "?address=" + address);
    load(address.trim());
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("address")) {
      setAddress(params.get("address").trim());
      load(params.get("address").trim());
    }
  }, []);

  useEffect(() => {
    document.body.classList.add('no-bg-header', 'no-bg-footer');
  }, []);

  return (
    <>
      <Head>
        <title>Thorstarter Rewards Dashboard</title>
        <meta name="description" content="Visualize your liquidity mining rewards"/>
        <meta property="og:image" content="https://rewards-dashboard.thorstarter.org/og.png"/>
      </Head>
      <Layout>
        <section className="section-hero section-hero--brand">
          <div className="wrap">
            <h1 className="section-title tac">Rewards Dashboard</h1>
            <div className="dashboard-input">
              <div className="text-field">
                <div className="text-field__holder">
                  <input
                    type="text"
                    className="text-field__input"
                    value={address}
                    placeholder="thor123... or 0x123..."
                    onChange={(e) => setAddress(e.target.value)}/>
                </div>
              </div>
              <button type="button" className="btn" onClick={onLoad}>Load</button>
            </div>

            {error ? (
                <div className="dashboard-error">
                  {error}
                </div>
            ) : null}
            {loading ? (
                <div className="dashboard-loading">
                  Loading...
                </div>
            ) : null}

            {position ? (
              <>
                <div className="dashboard-section">
                  <h3 className="section-title">THORChain XRUNE-RUNE LP</h3>
                  <div className="cards-grid">
                    <div className="dashboard-block tac">
                      <div className="dashboard-block__caption">LP Position Value</div>
                      <div className="dashboard-block__value">$ {history[0].value.toFixed(2)}</div>
                    </div>
                    <div className="dashboard-block tac">
                      <div className="dashboard-block__caption">Average APY</div>
                      <div className="dashboard-block__value">
                        {formatLargeNumber(
                          aprdToApy(
                            history.reduce((t, v) => t + v.growth, 0) /
                            (history.length - 1)
                          ) * 100
                        )}{" "}
                        %
                      </div>
                    </div>
                  </div>
                </div>

                <div className="dashboard-section">
                  <div className="dashboard-table">
                    <table>
                      <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>Date</th>
                        <th>XRUNE $</th>
                        <th>XRUNE #</th>
                        <th>RUNE #</th>
                        <th>Value $</th>
                        <th>Rewards $</th>
                        <th>Rewards %</th>
                        <th>Change $</th>
                        <th>Change %</th>
                        <th>Yearly APR %</th>
                        <th>Yearly APY %</th>
                      </tr>
                      </thead>
                      <tbody>
                      {history.map((h) => (
                        <tr key={h.pool.startTime}>
                          <td style={{ textAlign: "left" }}>
                            {formatDate(h.pool.startTime)}
                          </td>
                          <td>$ {parseFloat(h.pool.assetPriceUSD).toFixed(3)}</td>
                          <td>{h.assetAmount.toFixed(1)}</td>
                          <td>{h.runeAmount.toFixed(1)}</td>
                          <td>$ {h.value.toFixed(3)}</td>
                          <td>$ {h.tsRewards.toFixed(1)}</td>
                          <td>{(h.tsRewardsApy * 100).toFixed(0)} %</td>
                          <td>$ {(h.value * h.growth).toFixed(1)}</td>
                          <td>{(h.growth * 100).toFixed(1)} %</td>
                          <td>{(h.growth * 100 * 365).toFixed(1)} %</td>
                          <td>{formatLargeNumber(aprdToApy(h.growth) * 100)} %</td>
                        </tr>
                      ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : null}

            {staking ? (
              <div className="dashboard-section">
                <h3 className="section-title">
                  <Image src="/static/img/icons/ts.svg" alt="" width={15} height={40}/>
                  <a href="https://thorstarter.org/stake" target="_blank" rel="noreferrer">Staking</a> &nbsp;(Single Sided XRUNE)
                </h3>
                <div className="cards-grid">
                  <div className="dashboard-block tac">
                    <div className="dashboard-block__caption">Staked</div>
                    <div className="dashboard-block__value">{formatLargeNumber(staking.staked)}</div>
                    <div className="dashboard-block__foot">$ {formatLargeNumber(staking.staked * staking.price)}</div>
                  </div>
                  <div className="dashboard-block tac">
                    <div className="dashboard-block__caption">Pending Rewards</div>
                    <div className="dashboard-block__value">{formatLargeNumber(staking.pending)}</div>
                    <div className="dashboard-block__foot">$ {formatLargeNumber(staking.pending * staking.price)}</div>
                  </div>
                  <div className="dashboard-block tac">
                    <div className="dashboard-block__caption">Balance</div>
                    <div className="dashboard-block__value">{formatLargeNumber(staking.balance)}</div>
                    <div className="dashboard-block__foot">$ {formatLargeNumber(staking.balance * staking.price)}</div>
                  </div>
                  <div className="dashboard-block tac">
                    <div className="dashboard-block__caption">XRUNE Price</div>
                    <div className="dashboard-block__value">$ {staking.price.toFixed(4)}</div>
                  </div>
                </div>
              </div>
            ) : null}

            {sushiPosition && sushiHistory ? (
              <>
                <div className="dashboard-section">
                  <h3 className="section-title">
                    <Image src="/static/img/icons/sushiswap.png" alt="" width={32} height={32}/>
                    <a href="https://app.sushi.com/add/ETH/0x69fa0feE221AD11012BAb0FdB45d444D3D2Ce71c" target="_blank" rel="noreferrer">SushiSwap XRUNE-ETH LP</a>
                  </h3>
                  <div className="cards-grid">
                    <div className="dashboard-block tac">
                      <div className="dashboard-block__caption">LP Position Value</div>
                      <div className="dashboard-block__value">$ {sushiPosition.value.toFixed(2)}</div>
                    </div>
                    <div className="dashboard-block tac">
                      <div className="dashboard-block__caption">Average APY</div>
                      <div className="dashboard-block__value">
                        {formatLargeNumber(
                          aprdToApy(
                            sushiHistory.reduce((t, v) => t + v.growth, 0) /
                            (sushiHistory.length - 1)
                          ) * 100
                        )}{" "}
                        %
                      </div>
                    </div>
                  </div>
                </div>

                <div className="dashboard-section">
                  <div className="dashboard-table">
                    <table>
                      <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>Date</th>
                        <th>XRUNE $</th>
                        <th>XRUNE #</th>
                        <th>ETH #</th>
                        <th>Value $</th>
                        <th>Rewards $</th>
                        <th>Rewards %</th>
                        <th>Change $</th>
                        <th>Change %</th>
                        <th>Yearly APR %</th>
                        <th>Yearly APY %</th>
                      </tr>
                      </thead>
                      <tbody>
                      {sushiHistory.map((h) => (
                        <tr key={h.date}>
                          <td style={{ textAlign: "left" }}>{formatDate(h.date)}</td>
                          <td>$ {parseFloat(h.price).toFixed(3)}</td>
                          <td>{h.amountToken.toFixed(1)}</td>
                          <td>{h.amountEth.toFixed(1)}</td>
                          <td>$ {h.value.toFixed(3)}</td>
                          <td>$ {h.tsRewards.toFixed(1)}</td>
                          <td>{(h.tsRewardsApy * 100).toFixed(0)} %</td>
                          <td>$ {(h.value * h.growth).toFixed(1)}</td>
                          <td>{(h.growth * 100).toFixed(1)} %</td>
                          <td>{(h.growth * 100 * 365).toFixed(1)} %</td>
                          <td>{formatLargeNumber(aprdToApy(h.growth) * 100)} %</td>
                        </tr>
                      ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : null}

            <div className="page__content font-rules">
              <p>This app supports LP positions on <a href="https://app.thorswap.finance/add/ETH.XRUNE-0X69FA0FEE221AD11012BAB0FDB45D444D3D2CE71C" target="_blank" rel="noreferrer">THORChain</a>, <a href="https://app.sushi.com/add/ETH/0x69fa0feE221AD11012BAb0FdB45d444D3D2Ce71c" target="_blank" rel="noreferrer">SushiSwap</a> & <a
                href="https://thorstarter.org/stake" target="_blank" rel="noreferrer">XRUNE Staking</a>.</p>
              <p>Enter a &quot;thor0123...&quot; address for THORChain LP or an Ethereum &quot;0x123...&quot; address
                for SushiSwap LP & single sided XRUNE staking.</p>
            </div>

          </div>
        </section>
      </Layout>
    </>
    // <div className={styles.container}>
    //
    //
    //   <main className={styles.main}>
    //     <h1 className={styles.title}>Rewards Dashboard</h1>
    //
    //     <p className={styles.addressInput}>
    //       <input
    //         value={address}
    //         onChange={(e) => setAddress(e.target.value)}
    //         placeholder="thor123... or 0x123..."
    //       />
    //       <button onClick={onLoad}>Load</button>
    //     </p>
    //
    //     {error ? (
    //       <p style={{ marginTop: "16px", textAlign: "center", color: "red" }}>
    //         {error}
    //       </p>
    //     ) : null}
    //     {loading ? (
    //       <p style={{ marginTop: "16px", textAlign: "center" }}>Loading...</p>
    //     ) : null}
    //
    //     {position ? (
    //       <div>
    //         <h2>THORChain XRUNE-RUNE LP</h2>
    //         <div className={styles.boxes}>
    //           <div className={styles.boxesBox}>
    //             <div>LP Position Value</div>
    //             <div>$ {history[0].value.toFixed(2)}</div>
    //           </div>
    //           <div className={styles.boxesBox}>
    //             <div>Average APY</div>
    //             <div>
    //               {formatLargeNumber(
    //                 aprdToApy(
    //                   history.reduce((t, v) => t + v.growth, 0) /
    //                     (history.length - 1)
    //                 ) * 100
    //               )}{" "}
    //               %
    //             </div>
    //           </div>
    //         </div>
    //         <table className={styles.table}>
    //           <thead>
    //             <tr>
    //               <th style={{ textAlign: "left" }}>Date</th>
    //               <th>XRUNE $</th>
    //               <th>XRUNE #</th>
    //               <th>RUNE #</th>
    //               <th>Value $</th>
    //               <th>Rewards $</th>
    //               <th>Rewards %</th>
    //               <th>Change $</th>
    //               <th>Change %</th>
    //               <th>Yearly APR %</th>
    //               <th>Yearly APY %</th>
    //             </tr>
    //           </thead>
    //           <tbody>
    //             {history.map((h) => (
    //               <tr key={h.pool.startTime}>
    //                 <td style={{ textAlign: "left" }}>
    //                   {formatDate(h.pool.startTime)}
    //                 </td>
    //                 <td>$ {parseFloat(h.pool.assetPriceUSD).toFixed(3)}</td>
    //                 <td>{h.assetAmount.toFixed(1)}</td>
    //                 <td>{h.runeAmount.toFixed(1)}</td>
    //                 <td>$ {h.value.toFixed(3)}</td>
    //                 <td>$ {h.tsRewards.toFixed(1)}</td>
    //                 <td>{(h.tsRewardsApy * 100).toFixed(0)} %</td>
    //                 <td>$ {(h.value * h.growth).toFixed(1)}</td>
    //                 <td>{(h.growth * 100).toFixed(1)} %</td>
    //                 <td>{(h.growth * 100 * 365).toFixed(1)} %</td>
    //                 <td>{formatLargeNumber(aprdToApy(h.growth) * 100)} %</td>
    //               </tr>
    //             ))}
    //           </tbody>
    //         </table>
    //       </div>
    //     ) : null}
    //
    //     {staking ? (
    //       <div style={{ width: "100%" }}>
    //         <h2>Staking (Single Sided XRUNE)</h2>
    //         <div className={styles.boxes}>
    //           <div className={styles.boxesBox}>
    //             <div>Staked</div>
    //             <div>{formatLargeNumber(staking.staked)}</div>
    //             <div>$ {formatLargeNumber(staking.staked * staking.price)}</div>
    //           </div>
    //           <div className={styles.boxesBox}>
    //             <div>Pending Rewards</div>
    //             <div>{formatLargeNumber(staking.pending)}</div>
    //             <div>
    //               $ {formatLargeNumber(staking.pending * staking.price)}
    //             </div>
    //           </div>
    //         </div>
    //         <div className={styles.boxes}>
    //           <div className={styles.boxesBox}>
    //             <div>Balance</div>
    //             <div>{formatLargeNumber(staking.balance)}</div>
    //             <div>
    //               $ {formatLargeNumber(staking.balance * staking.price)}
    //             </div>
    //           </div>
    //           <div className={styles.boxesBox}>
    //             <div>XRUNE Price</div>
    //             <div>$ {staking.price.toFixed(4)}</div>
    //           </div>
    //         </div>
    //       </div>
    //     ) : null}
    //
    //     {sushiPosition && sushiHistory ? (
    //       <div>
    //         <h2>SushiSwap XRUNE-ETH LP</h2>
    //         <div className={styles.boxes}>
    //           <div className={styles.boxesBox}>
    //             <div>LP Position Value</div>
    //             <div>$ {sushiPosition.value.toFixed(2)}</div>
    //           </div>
    //           <div className={styles.boxesBox}>
    //             <div>Average APY</div>
    //             <div>
    //               {formatLargeNumber(
    //                 aprdToApy(
    //                   sushiHistory.reduce((t, v) => t + v.growth, 0) /
    //                     (sushiHistory.length - 1)
    //                 ) * 100
    //               )}{" "}
    //               %
    //             </div>
    //           </div>
    //         </div>
    //         <table className={styles.table}>
    //           <thead>
    //             <tr>
    //               <th style={{ textAlign: "left" }}>Date</th>
    //               <th>XRUNE $</th>
    //               <th>XRUNE #</th>
    //               <th>ETH #</th>
    //               <th>Value $</th>
    //               <th>Rewards $</th>
    //               <th>Rewards %</th>
    //               <th>Change $</th>
    //               <th>Change %</th>
    //               <th>Yearly APR %</th>
    //               <th>Yearly APY %</th>
    //             </tr>
    //           </thead>
    //           <tbody>
    //             {sushiHistory.map((h) => (
    //               <tr key={h.date}>
    //                 <td style={{ textAlign: "left" }}>{formatDate(h.date)}</td>
    //                 <td>$ {parseFloat(h.price).toFixed(3)}</td>
    //                 <td>{h.amountToken.toFixed(1)}</td>
    //                 <td>{h.amountEth.toFixed(1)}</td>
    //                 <td>$ {h.value.toFixed(3)}</td>
    //                 <td>$ {h.tsRewards.toFixed(1)}</td>
    //                 <td>{(h.tsRewardsApy * 100).toFixed(0)} %</td>
    //                 <td>$ {(h.value * h.growth).toFixed(1)}</td>
    //                 <td>{(h.growth * 100).toFixed(1)} %</td>
    //                 <td>{(h.growth * 100 * 365).toFixed(1)} %</td>
    //                 <td>{formatLargeNumber(aprdToApy(h.growth) * 100)} %</td>
    //               </tr>
    //             ))}
    //           </tbody>
    //         </table>
    //       </div>
    //     ) : null}
    //
    //     <p style={{ marginTop: "80px" }}>
    //       This app supports LP positions on THORChain, SushiSwap & XRUNE
    //       Staking.
    //       <br />
    //       <br />
    //       Enter a &quot;thor0123...&quot; address for THORChain LP or an
    //       Ethereum &quot;0x123...&quot; address for SushiSwap LP & single sided
    //       XRUNE staking.
    //     </p>
    //   </main>
    //
    //   <footer className={styles.footer}>
    //     <a
    //       href="https://www.thorstarter.org"
    //       target="_blank"
    //       rel="noopener noreferrer"
    //     >
    //       Thorstarter
    //     </a>
    //   </footer>
    // </div>
  );
}
