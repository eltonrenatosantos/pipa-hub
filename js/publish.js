// /js/publish.js
import { supabase } from "./supabase.js";


const imageInput = document.getElementById("event-image");
let preview = document.getElementById("preview");

// capitalizar primeira letra automaticamente
const textFields = [
  "event-title",
  "event-city",
  "event-location",
  "event-instagram"
];

textFields.forEach(id => {
  const field = document.getElementById(id);

  if(field){
    field.addEventListener("input", () => {
      if(field.value.length === 1){
        field.value = field.value.charAt(0).toUpperCase();
      }
      if(field.value.length > 1){
        field.value = field.value.charAt(0).toUpperCase() + field.value.slice(1);
      }
    });
  }
});

// cria preview automaticamente se não existir no HTML
if(imageInput && !preview){
  preview = document.createElement("img");
  preview.id = "preview";
  preview.style.width = "100%";
  preview.style.marginTop = "10px";
  preview.style.borderRadius = "12px";
  preview.style.display = "none";

  imageInput.parentElement.appendChild(preview);
}

if(imageInput && preview){
  imageInput.addEventListener("change", () => {
    const file = imageInput.files[0];
    if(!file) return;

    const reader = new FileReader();

    reader.onload = e => {
      preview.src = e.target.result;
      preview.style.display = "block";
    };

    reader.readAsDataURL(file);
  });
}

// compressão da imagem antes do upload
async function compressImage(file){
  return new Promise((resolve) => {

    const img = new Image();
    const reader = new FileReader();

    reader.onload = e => {
      img.src = e.target.result;
    };

    img.onload = () => {

      const canvas = document.createElement("canvas");

      const maxWidth = 1200; // limite de largura
      const scale = Math.min(maxWidth / img.width, 1);

      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        blob => resolve(blob),
        "image/jpeg",
        0.7 // qualidade 70%
      );

    };

    reader.readAsDataURL(file);
  });
}

async function geocode(city, location){
  try{
    const query = encodeURIComponent(`${location} ${city} Brasil`);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;

    const res = await fetch(url);
    const data = await res.json();

    if(data && data.length){
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      };
    }
  }catch(e){
    console.error("Erro ao buscar coordenadas", e);
  }

  return { lat:null, lng:null };
}

// autocomplete de cidade usando Nominatim
const cityInput = document.getElementById("event-city");

if(cityInput){

  const cityBox = document.createElement("div");
  cityBox.style.position = "absolute";
  cityBox.style.background = "#111";
  cityBox.style.border = "1px solid #333";
  cityBox.style.borderRadius = "10px";
  cityBox.style.marginTop = "4px";
  cityBox.style.width = "100%";
  cityBox.style.zIndex = "9999";
  cityBox.style.fontSize = "14px";
  cityBox.style.display = "none";

  cityInput.parentElement.appendChild(cityBox);

  cityInput.addEventListener("input", async () => {

    const value = cityInput.value.trim();
    if(value.length < 2){
      cityBox.style.display = "none";
      return;
    }

    const cityField = document.getElementById("event-city");
    const cityValue = cityField ? cityField.value.trim() : "";
    const query = encodeURIComponent(`${value} ${cityValue} Brasil`);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&addressdetails=1&limit=5`
    );

    const results = await res.json();

    cityBox.innerHTML = "";

    if(!results.length){
      cityBox.style.display = "none";
      return;
    }

    results.forEach(place => {

      const item = document.createElement("div");
      item.style.padding = "8px";
      item.style.cursor = "pointer";
      item.style.borderBottom = "1px solid #222";

      const cityName = place.address?.city || place.address?.town || place.address?.municipality || place.address?.state || place.display_name;
      item.innerText = cityName;

      item.addEventListener("click", () => {
        cityInput.value = cityName;
        cityBox.style.display = "none";
      });

      cityBox.appendChild(item);

    });

    cityBox.style.display = "block";

  });

  document.addEventListener("click", (e)=>{
    if(!cityBox.contains(e.target) && e.target !== cityInput){
      cityBox.style.display = "none";
    }
  });

}

// autocomplete de endereço usando Nominatim
const locationInput = document.getElementById("event-location");

if(locationInput){

  const suggestionBox = document.createElement("div");
  suggestionBox.style.position = "absolute";
  suggestionBox.style.background = "#111";
  suggestionBox.style.border = "1px solid #333";
  suggestionBox.style.borderRadius = "10px";
  suggestionBox.style.marginTop = "4px";
  suggestionBox.style.width = "100%";
  suggestionBox.style.zIndex = "9999";
  suggestionBox.style.fontSize = "14px";
  suggestionBox.style.display = "none";

  locationInput.parentElement.appendChild(suggestionBox);

  locationInput.addEventListener("input", async () => {

    const value = locationInput.value.trim();
    if(value.length < 2){
      suggestionBox.style.display = "none";
      return;
    }

    const cityField = document.getElementById("event-city");
    const cityValue = cityField ? cityField.value.trim() : "";
    const query = encodeURIComponent(`${value} ${cityValue} Brasil`);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&addressdetails=1&limit=5`
    );

    const results = await res.json();

    suggestionBox.innerHTML = "";

    if(!results.length){
      suggestionBox.style.display = "none";
      return;
    }

    results.forEach(place => {

      const item = document.createElement("div");
      item.style.padding = "8px";
      item.style.cursor = "pointer";
      item.style.borderBottom = "1px solid #222";
      item.innerText = place.display_name;

      item.addEventListener("click", () => {
        locationInput.value = place.display_name;
        suggestionBox.style.display = "none";
      });

      suggestionBox.appendChild(item);

    });

    suggestionBox.style.display = "block";

  });

  document.addEventListener("click", (e)=>{
    if(!suggestionBox.contains(e.target) && e.target !== locationInput){
      suggestionBox.style.display = "none";
    }
  });

}

const button = document.getElementById("publish-event");
if(button) button.addEventListener("click", async ()=>{

  const title = document.getElementById("event-title").value.trim();
  const city = document.getElementById("event-city").value.trim();
  const location = document.getElementById("event-location").value.trim();
  const date = document.getElementById("event-date").value;
  const instagram = document.getElementById("event-instagram").value.trim();
  const imageFile = document.getElementById("event-image").files[0];
  let image = "";

  if(!title || !city || !date){
    alert("Preencha pelo menos nome, cidade e data");
    return;
  }

  if(imageFile){

    const fileName = `${Date.now()}_${imageFile.name}`;

    const compressedImage = await compressImage(imageFile);

    const { error: uploadError } = await supabase
      .storage
      .from("event-images")
      .upload(fileName, compressedImage);

    if(uploadError){
      console.error(uploadError);
      alert("Erro ao enviar imagem");
      return;
    }

    const { data } = supabase
      .storage
      .from("event-images")
      .getPublicUrl(fileName);

    image = data.publicUrl;

  }

  const coords = await geocode(city, location);

  const { error } = await supabase
    .from("events")
    .insert([
      {
        title,
        city,
        location,
        date,
        instagram,
        image,
        lat: coords.lat,
        lng: coords.lng
      }
    ]);

  if(error){
    console.error(error);
    alert("Erro ao publicar evento");
    return;
  }

  alert("Evento publicado com sucesso!");

  document.getElementById("event-title").value="";
  document.getElementById("event-city").value="";
  document.getElementById("event-location").value="";
  document.getElementById("event-date").value="";
  document.getElementById("event-instagram").value="";
  document.getElementById("event-image").value="";

});
