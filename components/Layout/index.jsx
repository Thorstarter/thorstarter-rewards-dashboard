import Header from "./Header";
import Footer from "./Footer";

export default function Layout({children}) {
	return (
		<>
			<Header/>
			<main className="main">
				{children}
			</main>
			<Footer/>
		</>
	)
}