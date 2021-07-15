import { useState, useEffect, useRef } from "react";
import * as ethers from "ethers";
import Head from "next/head";
import Image from "next/image";
import Layout from "../components/Layout";
import { slideToggle } from 'slidetoggle';
import lscache from 'lscache';
import { tokenAbi, stakingAbi, sushiSwapPoolAbi } from "../utils/abis";

// test address thor16slycxn5twp2454pu785n34vq0u4mag8588xcy

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
  const [savedAddresses, setSavedAddresses] = useState(lscache.get('thorstarter-saved-addresses'));
  const [list, setList] = useState([]);
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const loop = useRef(null);

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

      return {
        type: 'thor',
        history: enrichedHistory,
        position: xrunePosition
      };
    } catch (err) {
      if (err.toString().includes("404")) {
        setError("No XRUNE LP found for this address.");
        return {
          error: 'No XRUNE LP found for this address.'
        }
      }
      setError("Error: " + err.toString());
      return {
        error: err.toString()
      }
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

      return {
        type: 'x0',
        history: history,
        position: { value: history.length > 0 ? history[0].value : 0 }
      };
    } catch (err) {
      setError("Error: " + err.toString());
      return {
        error: err.toString()
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadStaking(address) {

    let xrunePrice = 0;
    try{

      const cmc = await fetch('https://1e35cbc19de1456caf8c08b2b4ead7d2.thorstarter.org/595cf62030316481c442e0ed49580de5/',{method : "POST"})
        .then(res => res.text());

      xrunePrice = parseFloat(cmc);

      if(isNaN(xrunePrice)){
        xrunePrice = 0;
      }

      // console.log(xrunePrice);
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

      return {
        balance: parseFloat(formatUnits(balance)),
        staked: parseFloat(formatUnits(staked)),
        pending: parseFloat(formatUnits(pending)),
        price: xrunePrice,
      };
    } catch (err) {
      setError("Error: " + err.toString());
      return {
        error: err.toString()
      }
    } finally {
      setLoading(false);
    }
  }

  async function load(address) {
    setError('');
    if (address.startsWith("thor")) {
      const result = {
        ...await loadLpThorchain(address),
        address: address
      };
      setList(prevState => ([...prevState, result]))
    }
    if (address.startsWith("0x")) {
      const result = {
        ...await loadLpSushiSwap(address),
        staking: await loadStaking(address),
        address: address
      };
      // console.log(result);
      setList(prevState => ([...prevState, result]))
    }
  }

  function onLoad(e) {
    e.preventDefault();
    e.stopPropagation();
    // window.history.pushState("", null, "?address=" + address);

    if(!savedAddresses) {
      setSavedAddresses([address]);
    } else {
      if(!savedAddresses.includes(address)) {
        setSavedAddresses(prevState => ([...prevState, address]));
      }
    }

    // load(address);
    setAddress('');
  }

  function onClickHeading(e, parent = false) {
    const head = parent ? e.target.closest('.js__headline') : e.target;
    const body = head.nextElementSibling;

    if(parent) {
      head.closest('[data-slidetoggle]').style.height = 'auto';
    }

    head.classList.toggle('is-pressed');
    try {
      slideToggle.slideToggle(body, 250);
    } catch (e) {}
  }

  function onRemoveAddress(address) {
    const newArray = savedAddresses.filter(item => item !== address);
    setSavedAddresses(newArray);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('address')) {
      if(!savedAddresses) {
        setSavedAddresses([params.get('address')]);
      } else {
        if(!savedAddresses.includes(params.get('address'))) {
          setSavedAddresses(prevState => ([...prevState, params.get('address')]));
        }
      }
    }

    document.body.classList.add('no-bg-header', 'no-bg-footer');
  }, []);

  useEffect(() => {
    loop.current.innerHTML = '';
    lscache.set('thorstarter-saved-addresses', savedAddresses);
    savedAddresses && savedAddresses.forEach(address => load(address));
  }, [savedAddresses]);

  return (
    <>

      {/*0x7d53b506acf7c3986199a3a43f819e005b984b54*/}
      {/*0xa8844710d31d8a0F74C1c67711Eb183F05A3926a*/}
      <Head>
        <title>Thorstarter Rewards Dashboard</title>
        <meta name="description" content="Visualize your liquidity mining rewards"/>
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
              <button type="button" className="btn" onClick={onLoad}>Add</button>
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

            <div className="rewards-dashboard-loop" ref={loop}>
              {list.length > 0 && list.reverse().map((item, i) => {
                return (
                  <div className="rewards-dashboard" key={i}>
                    <div className="rewards-dashboard__head" onClick={(e) => onClickHeading(e)}>
                      {item.address}
                      <button type="button" onClick={() => onRemoveAddress(item.address)}><IconRemove/>Remove</button>
                    </div>
                    <div className="rewards-dashboard__body">
                      {item.type === 'x0' ? (
                        <>
                          {Object.keys(item.staking).length > 0 && (
                            <div className="dashboard-section">
                              <div className="dashboard-section__head js__headline" onClick={e => onClickHeading(e, true)}>
                                <h3 className="section-title">
                                  <Image src="/static/img/icons/ts.svg" alt="" width={15} height={40}/>
                                  <a href="https://thorstarter.org/stake" target="_blank" rel="noreferrer">Staking</a> &nbsp;(Single Sided XRUNE)
                                </h3>
                              </div>
                              <div style={{display: 'none'}}>
                                <div className="cards-grid">
                                  <div className="dashboard-block tac">
                                    <div className="dashboard-block__caption">Staked</div>
                                    <div className="dashboard-block__value">{formatLargeNumber(item.staking.staked)}</div>
                                    <div className="dashboard-block__foot">$ {formatLargeNumber(item.staking.staked * item.staking.price)}</div>
                                  </div>
                                  <div className="dashboard-block tac">
                                    <div className="dashboard-block__caption">Pending Rewards</div>
                                    <div className="dashboard-block__value">{formatLargeNumber(item.staking.pending)}</div>
                                    <div className="dashboard-block__foot">$ {formatLargeNumber(item.staking.pending * item.staking.price)}</div>
                                  </div>
                                  <div className="dashboard-block tac">
                                    <div className="dashboard-block__caption">Balance</div>
                                    <div className="dashboard-block__value">{formatLargeNumber(item.staking.balance)}</div>
                                    <div className="dashboard-block__foot">$ {formatLargeNumber(item.staking.balance * item.staking.price)}</div>
                                  </div>
                                  <div className="dashboard-block tac">
                                    <div className="dashboard-block__caption">XRUNE Price</div>
                                    <div className="dashboard-block__value">$ {item.staking.price.toFixed(4)}</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                          {Object.keys(item.history).length > 0 && Object.keys(item.position).length > 0 && (
                            <>
                              <div className="dashboard-section">
                                <div className="dashboard-section__head js__headline" onClick={e => onClickHeading(e, true)}>
                                  <h3 className="section-title">
                                    <Image src="/static/img/icons/sushiswap.png" alt="" width={32} height={32}/>
                                    <a href="https://app.sushi.com/add/ETH/0x69fa0feE221AD11012BAb0FdB45d444D3D2Ce71c" target="_blank" rel="noreferrer">SushiSwap XRUNE-ETH LP</a>
                                  </h3>
                                </div>
                                <div style={{display: 'none'}}>
                                  <div className="cards-grid">
                                    <div className="dashboard-block tac">
                                      <div className="dashboard-block__caption">LP Position Value</div>
                                      <div className="dashboard-block__value">$ {item.position.value.toFixed(2)}</div>
                                    </div>
                                    <div className="dashboard-block tac">
                                      <div className="dashboard-block__caption">Average APY</div>
                                      <div className="dashboard-block__value">
                                        {formatLargeNumber(
                                          aprdToApy(
                                            item.history.reduce((t, v) => t + v.growth, 0) /
                                            (item.history.length - 1)
                                          ) * 100
                                        )}{" "}
                                        %
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
                                        {item.history.map((h) => (
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
                                </div>
                              </div>
                            </>
                          )}
                        </>
                      ) : item.type === 'thor' ? (
                        <>
                          {Object.keys(item.position).length > 0 && (
                            <>
                              <div className="dashboard-section">
                                <div className="dashboard-section__head js__headline" onClick={e => onClickHeading(e, true)}>
                                  <h3 className="section-title">
                                    <Image src="/static/img/src/icon-xrune.png" alt="" width={32} height={32}/>
                                    <a href="https://app.thorswap.finance/add/ETH.XRUNE-0X69FA0FEE221AD11012BAB0FDB45D444D3D2CE71C" target="_blank" rel="noreferrer">
                                      THORChain XRUNE-RUNE LP
                                    </a>
                                  </h3>
                                </div>
                                <div style={{display: 'none'}}>
                                  <div className="cards-grid">
                                    <div className="dashboard-block tac">
                                      <div className="dashboard-block__caption">LP Position Value</div>
                                      <div className="dashboard-block__value">$ {item.history[0].value.toFixed(2)}</div>
                                    </div>
                                    <div className="dashboard-block tac">
                                      <div className="dashboard-block__caption">Average APY</div>
                                      <div className="dashboard-block__value">
                                        {formatLargeNumber(
                                          aprdToApy(
                                            item.history.reduce((t, v) => t + v.growth, 0) /
                                            (item.history.length - 1)
                                          ) * 100
                                        )}{" "}
                                        %
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
                                        {item.history.map((h) => (
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
                                </div>
                              </div>

                            </>
                          )}
                        </>
                      ) : (
                        <></>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

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
  );
}

const IconRemove = () => (
  <svg width="20" height="20" viewBox="0 0 512 512" fill="white" xmlns="http://www.w3.org/2000/svg">
    <path d="M356.65,450H171.47a41,41,0,0,1-40.9-40.9V120.66a15,15,0,0,1,15-15h237a15,15,0,0,1,15,15V409.1A41,41,0,0,1,356.65,450ZM160.57,135.66V409.1a10.91,10.91,0,0,0,10.9,10.9H356.65a10.91,10.91,0,0,0,10.91-10.9V135.66Z"/>
    <path d="M327.06,135.66h-126a15,15,0,0,1-15-15V93.4A44.79,44.79,0,0,1,230.8,48.67h66.52A44.79,44.79,0,0,1,342.06,93.4v27.26A15,15,0,0,1,327.06,135.66Zm-111-30h96V93.4a14.75,14.75,0,0,0-14.74-14.73H230.8A14.75,14.75,0,0,0,216.07,93.4Z"/>
    <path d="M264.06,392.58a15,15,0,0,1-15-15V178.09a15,15,0,1,1,30,0V377.58A15,15,0,0,1,264.06,392.58Z"/>
    <path d="M209.9,392.58a15,15,0,0,1-15-15V178.09a15,15,0,0,1,30,0V377.58A15,15,0,0,1,209.9,392.58Z"/>
    <path d="M318.23,392.58a15,15,0,0,1-15-15V178.09a15,15,0,0,1,30,0V377.58A15,15,0,0,1,318.23,392.58Z"/>
    <path d="M405.81,135.66H122.32a15,15,0,0,1,0-30H405.81a15,15,0,0,1,0,30Z"/>
  </svg>
)
