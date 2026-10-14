const axios = require('axios');
const tmdbKey = '15d2dde73f0e32cd39c335a7373b773f';

async function findAtharva() {
  const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${tmdbKey}&query=Atharva&year=2023`;
  const res = await axios.get(searchUrl);
  console.log('Search results:', res.data.results.map(r => ({ id: r.id, title: r.title, release_date: r.release_date, poster_path: r.poster_path })));
  if (res.data.results.length > 0) {
    const movieId = res.data.results[0].id;
    const creditsUrl = `https://api.themoviedb.org/3/movie/${movieId}/credits?api_key=${tmdbKey}`;
    const credRes = await axios.get(creditsUrl);
    console.log('Top cast from TMDB:');
    credRes.data.cast.slice(0, 15).forEach(c => {
      console.log(`${c.name} | profile_path: ${c.profile_path ? 'https://image.tmdb.org/t/p/w500' + c.profile_path : 'NONE'}`);
    });
  }
}
findAtharva();
