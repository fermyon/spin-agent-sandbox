// Generate 10 random numbers
const numbers = [];
for (let i = 0; i < 10; i++) {
    numbers.push(Math.random() * 100); // Random numbers between 0 and 100
}

console.log("Original random numbers:");
console.log(numbers.map(n => n.toFixed(2)));

// Sort the numbers
const sortedNumbers = [...numbers].sort((a, b) => a - b);

console.log("\nSorted numbers (ascending):");
console.log(sortedNumbers.map(n => n.toFixed(2)));
