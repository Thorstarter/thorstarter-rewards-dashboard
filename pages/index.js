import { useState } from 'react';
import Head from 'next/head'
import Image from 'next/image'
import styles from '../styles/Home.module.css'

// test address thor16slycxn5twp2454pu785n34vq0u4mag8588xcy

const API = 'https://midgard.thorchain.info/v2';
const POOL = 'ETH.XRUNE-0X69FA0FEE221AD11012BAB0FDB45D444D3D2CE71C';

const fetchJson = url => fetch(API+url).then(r => {
  if (!r.ok) throw new Error('Non 2xx status code: '+r.status);
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
  const d = new Date(parseInt(ts)*1000);
  const pad = s => ('0'+s).slice(-2);
  return [d.getFullYear(), pad(d.getMonth()+1), pad(d.getDate())].join('-');
}

function aprdToApy(rate) {
  return Math.pow(1 + rate, 365) - 1;
}

function formatLargeNumber(n) {
  if (n > 1000000000000000) return (n/1000000000000000).toFixed(1)+'Q';
  if (n > 1000000000000) return (n/1000000000000).toFixed(1)+'T';
  if (n > 1000000000) return (n/1000000000).toFixed(1)+'B';
  if (n > 1000000) return (n/1000000).toFixed(1)+'M';
  if (n > 10000) return (n/1000).toFixed(1)+'K';
  return n.toFixed(1);
}

export default function Home() {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [position, setPosition] = useState();
  const [history, setHistory] = useState();

  async function onLoad(e) {
    e.preventDefault();
    try {
      setLoading(true);
      const positions = (await fetchJson(`/member/${address}`)).pools;
      const xrunePosition = positions.find(p => p.pool === POOL);
      console.log(xrunePosition);
      if (!xrunePosition) {
        setError('No XRUNE LP found for this address.');
        return;
      }
      const history = (await fetchJson(`/history/depths/${POOL}?interval=day&count=60&from=${xrunePosition.dateFirstAdded}`)).intervals;
      const enrichedHistory = [];
      for (let h of history) {
        const liqPercentage = parseInt(xrunePosition.liquidityUnits) / parseInt(h.liquidityUnits);
        const value = (parseInt(h.assetDepth) / Math.pow(10, 8)) * 2 * liqPercentage * parseFloat(h.assetPriceUSD);
        const growth = enrichedHistory.length > 0 ? (value / enrichedHistory[0].value) - 1 : 0;
        enrichedHistory.splice(0, 0, {
          assetAmount: (parseInt(h.assetDepth) / Math.pow(10, 8)) * liqPercentage,
          runeAmount: (parseInt(h.runeDepth) / Math.pow(10, 8)) * liqPercentage,
          value: value,
          growth: growth,
          pool: h,
          position: xrunePosition,
        });
      }

      setHistory(enrichedHistory);
      setPosition(xrunePosition);
    } catch (err) {
      if (err.toString().includes('404')) {
        setError('No XRUNE LP found for this address.');
        return;
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <Head>
        <title>Thorstarter Rewards Dashboard</title>
        <meta name="description" content="Visualize your liquidity mining rewards" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>
          Rewards Dashboard
        </h1>

        <p className={styles.addressInput}>
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="thor0123..." />
          <button onClick={onLoad}>Load</button>
        </p>

        {error ? <p style={{marginTop: '16px', textAlign: 'center', color: 'red'}}>{error}</p> : null}
        {loading ? <p style={{marginTop: '16px', textAlign: 'center'}}>Loading...</p> : null}

        {position ? (
          <div>
            <div style={{display: 'flex', marginBottom: '32px'}}>
              <div style={{flex: '1', padding: '32px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '6px', textAlign: 'center', marginRight: '32px'}}>
                <div style={{marginBottom: '8px'}}>LP Position Value</div>
                <div style={{fontSize: '24px', fontWeight: 'bold'}}>$ {history[0].value.toFixed(2)}</div>
              </div>
              <div style={{flex: '1', padding: '32px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '6px', textAlign: 'center'}}>
                <div style={{marginBottom: '8px'}}>Average APY</div>
                <div style={{fontSize: '24px', fontWeight: 'bold'}}>{formatLargeNumber(aprdToApy(history.reduce((t, v) => t + v.growth, 0)/(history.length-1))*100)} %</div>
              </div>
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th style={{textAlign: 'right'}}>XRUNE $</th>
                  <th style={{textAlign: 'right'}}>XRUNE #</th>
                  <th style={{textAlign: 'right'}}>RUNE #</th>
                  <th style={{textAlign: 'right'}}>Value $</th>
                  <th style={{textAlign: 'right'}}>Change $</th>
                  <th style={{textAlign: 'right'}}>Daily Growth %</th>
                  <th style={{textAlign: 'right'}}>Yearly APR %</th>
                  <th style={{textAlign: 'right'}}>Yearly APY %</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.pool.startTime}>
                    <td>{formatDate(h.pool.startTime)}</td>
                    <td style={{textAlign: 'right'}}>${parseFloat(h.pool.assetPriceUSD).toFixed(3)}</td>
                    <td style={{textAlign: 'right'}}>{h.assetAmount.toFixed(3)}</td>
                    <td style={{textAlign: 'right'}}>{h.runeAmount.toFixed(3)}</td>
                    <td style={{textAlign: 'right'}}>$ {h.value.toFixed(3)}</td>
                    <td style={{textAlign: 'right'}}>$ {(h.value * h.growth).toFixed(3)}</td>
                    <td style={{textAlign: 'right'}}>{(h.growth*100).toFixed(1)} %</td>
                    <td style={{textAlign: 'right'}}>{(h.growth*100*365).toFixed(1)} %</td>
                    <td style={{textAlign: 'right'}}>{formatLargeNumber(aprdToApy(h.growth)*100)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <p style={{marginTop: '80px', textAlign: 'center'}}>
          This app only support LP positions on THORChain at the moment.<br/>
          <br/>
          At a later point it will be possible to track pending single sided<br/>
          XRUNE staking rewards and estimated SushiSwap LP rewards.
        </p>
      </main>

      <footer className={styles.footer}>
        <a
          href="https://www.thorstarter.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Thorstarter
        </a>
      </footer>
    </div>
  )
}
